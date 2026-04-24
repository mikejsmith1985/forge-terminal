package terminal

import "testing"

// TestPurgeStaleActive_NilNoop confirms purge is a no-op when no
// connection has ever been marked active.
func TestPurgeStaleActive_NilNoop(t *testing.T) {
	hub := newSessionHub()
	if hub.purgeStaleActive() {
		t.Fatal("purgeStaleActive on empty hub should return false")
	}
}

// TestPurgeStaleActive_KeepsLiveActive confirms a connection that is
// still in the clients map is not cleared.  This is the regression
// guard against an over-eager purge silently demoting the real owner.
func TestPurgeStaleActive_KeepsLiveActive(t *testing.T) {
	hub := newSessionHub()
	owner := &connWriter{}
	hub.mu.Lock()
	hub.clients[owner] = struct{}{}
	hub.mu.Unlock()
	hub.setActive(owner)

	if hub.purgeStaleActive() {
		t.Fatal("purgeStaleActive should not clear a connection that is still in clients")
	}
	if hub.getActive() != owner {
		t.Fatal("active conn was cleared even though it is still connected")
	}
}

// TestPurgeStaleActive_ClearsDangling reproduces the phantom-banner
// race: the previous owner's defer hasn't removed it from clients yet,
// but a new connection has already arrived.  Without purge, the new
// connection sees isActiveDevice:false and shows the "Another device
// controls this terminal" banner.  With purge, the dangling pointer
// is cleared and the new client is auto-promoted.
func TestPurgeStaleActive_ClearsDangling(t *testing.T) {
	hub := newSessionHub()
	stale := &connWriter{}
	// Mark stale as active but DO NOT add to clients — this models a
	// connection whose read-loop already exited (and whose remove() ran)
	// but whose pointer the hub still holds.
	hub.setActive(stale)

	if !hub.purgeStaleActive() {
		t.Fatal("purgeStaleActive should report cleared=true when active is not in clients")
	}
	if hub.getActive() != nil {
		t.Fatal("activeConn should be nil after purge of stale pointer")
	}
}
