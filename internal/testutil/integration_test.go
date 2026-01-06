// Package testutil provides integration test examples using Testcontainers.
// This file demonstrates the ANTI-MOCK pattern: Real database, no mocks.
//
// IMPORTANT: Integration tests require Docker to be running.
// Run with: go test -tags=integration ./internal/testutil/...
//
//go:build integration

package testutil

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "github.com/lib/pq" // PostgreSQL driver
)

// =============================================================================
// INTEGRATION TESTS - Real Database via Testcontainers
// =============================================================================

func TestPostgresContainer_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Start a REAL Postgres container
	db, err := StartPostgres(ctx, DefaultPostgresConfig())
	if err != nil {
		t.Fatalf("Failed to start Postgres container: %v", err)
	}
	// CRITICAL: Always cleanup!
	defer db.Terminate(ctx)

	t.Logf("Postgres container started at %s:%s", db.Host, db.Port)
	t.Logf("DSN: %s", db.DSN)

	// Verify we can connect
	conn, err := sql.Open("postgres", db.DSN)
	if err != nil {
		t.Fatalf("Failed to open connection: %v", err)
	}
	defer conn.Close()

	// Ping the database
	if err := conn.PingContext(ctx); err != nil {
		t.Fatalf("Failed to ping database: %v", err)
	}

	t.Log("Successfully connected to Postgres container!")
}

func TestPostgresContainer_CreateTable_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	db, err := StartPostgres(ctx, DefaultPostgresConfig())
	if err != nil {
		t.Fatalf("Failed to start container: %v", err)
	}
	defer db.Terminate(ctx)

	conn, err := sql.Open("postgres", db.DSN)
	if err != nil {
		t.Fatalf("Failed to open connection: %v", err)
	}
	defer conn.Close()

	// Create a test table (simulating migration)
	_, err = conn.ExecContext(ctx, `
		CREATE TABLE test_users (
			id SERIAL PRIMARY KEY,
			name VARCHAR(100) NOT NULL,
			email VARCHAR(100) UNIQUE NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		t.Fatalf("Failed to create table: %v", err)
	}

	// Insert test data
	result, err := conn.ExecContext(ctx,
		"INSERT INTO test_users (name, email) VALUES ($1, $2)",
		"Test User", "test@example.com",
	)
	if err != nil {
		t.Fatalf("Failed to insert: %v", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected != 1 {
		t.Errorf("Expected 1 row affected, got %d", rowsAffected)
	}

	// Query back
	var name, email string
	err = conn.QueryRowContext(ctx,
		"SELECT name, email FROM test_users WHERE email = $1",
		"test@example.com",
	).Scan(&name, &email)
	if err != nil {
		t.Fatalf("Failed to query: %v", err)
	}

	if name != "Test User" {
		t.Errorf("Expected name 'Test User', got %q", name)
	}

	t.Logf("Successfully created table and inserted/queried data!")
}

// =============================================================================
// EXAMPLE: How to use in your own tests
// =============================================================================
//
// func TestMyRepository_Integration(t *testing.T) {
//     ctx := context.Background()
//     db, err := testutil.StartPostgres(ctx, testutil.DefaultPostgresConfig())
//     if err != nil {
//         t.Fatal(err)
//     }
//     defer db.Terminate(ctx)
//
//     // Apply your migrations
//     applyMigrations(db.DSN)
//
//     // Create your repository with REAL database
//     repo := NewUserRepository(db.DSN)
//
//     // Test REAL database operations
//     user, err := repo.Create(ctx, &User{Name: "Test"})
//     assert.NoError(t, err)
//     assert.NotEmpty(t, user.ID)
//
//     // Query back - from REAL database
//     found, err := repo.GetByID(ctx, user.ID)
//     assert.NoError(t, err)
//     assert.Equal(t, "Test", found.Name)
// }
