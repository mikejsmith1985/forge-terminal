// Package testutil provides testing utilities including Testcontainers integration.
// This package is used ONLY in integration tests - not for unit tests.
//
// PHILOSOPHY:
// - Unit tests: STRICT MOCKING (no real DB/network)
// - Integration tests: REAL DATABASE via Testcontainers (no mocks)
//
// This helper spins up a real Postgres container for integration tests,
// ensuring we test against actual database behavior.
package testutil

import (
	"context"
	"fmt"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// TestDB represents a test database container
type TestDB struct {
	Container testcontainers.Container
	Host      string
	Port      string
	User      string
	Password  string
	Database  string
	DSN       string
}

// PostgresConfig holds configuration for the Postgres container
type PostgresConfig struct {
	Image    string // Docker image (default: "postgres:16-alpine")
	Database string // Database name (default: "forge_test")
	User     string // Username (default: "test")
	Password string // Password (default: "test")
}

// DefaultPostgresConfig returns sensible defaults for testing
func DefaultPostgresConfig() PostgresConfig {
	return PostgresConfig{
		Image:    "postgres:16-alpine",
		Database: "forge_test",
		User:     "test",
		Password: "test",
	}
}

// StartPostgres spins up a fresh Postgres container for integration testing.
// The container is started fresh for each test suite to ensure isolation.
//
// Usage:
//
//	func TestIntegration(t *testing.T) {
//	    ctx := context.Background()
//	    db, err := testutil.StartPostgres(ctx, testutil.DefaultPostgresConfig())
//	    if err != nil {
//	        t.Fatalf("Failed to start test DB: %v", err)
//	    }
//	    defer db.Terminate(ctx) // CRITICAL: Always cleanup!
//	
//	    // db.DSN contains the connection string
//	    // Run your tests here...
//	}
func StartPostgres(ctx context.Context, cfg PostgresConfig) (*TestDB, error) {
	if cfg.Image == "" {
		cfg.Image = "postgres:16-alpine"
	}
	if cfg.Database == "" {
		cfg.Database = "forge_test"
	}
	if cfg.User == "" {
		cfg.User = "test"
	}
	if cfg.Password == "" {
		cfg.Password = "test"
	}

	container, err := postgres.Run(ctx,
		cfg.Image,
		postgres.WithDatabase(cfg.Database),
		postgres.WithUsername(cfg.User),
		postgres.WithPassword(cfg.Password),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to start postgres container: %w", err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		container.Terminate(ctx)
		return nil, fmt.Errorf("failed to get container host: %w", err)
	}

	mappedPort, err := container.MappedPort(ctx, "5432")
	if err != nil {
		container.Terminate(ctx)
		return nil, fmt.Errorf("failed to get mapped port: %w", err)
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		cfg.User, cfg.Password, host, mappedPort.Port(), cfg.Database)

	return &TestDB{
		Container: container,
		Host:      host,
		Port:      mappedPort.Port(),
		User:      cfg.User,
		Password:  cfg.Password,
		Database:  cfg.Database,
		DSN:       dsn,
	}, nil
}

// Terminate stops and removes the container.
// This MUST be called in test cleanup (use defer).
func (db *TestDB) Terminate(ctx context.Context) error {
	if db.Container != nil {
		return db.Container.Terminate(ctx)
	}
	return nil
}

// ConnectionString returns the DSN for database connection
func (db *TestDB) ConnectionString() string {
	return db.DSN
}

// ExecSQL executes a SQL statement against the test database.
// Useful for running migrations or seed data.
func (db *TestDB) ExecSQL(ctx context.Context, sql string) error {
	// This would require a database driver import
	// Left as a placeholder - implement based on your DB driver choice
	// (e.g., pgx, database/sql with pq, etc.)
	return fmt.Errorf("ExecSQL not implemented - add your preferred DB driver")
}
