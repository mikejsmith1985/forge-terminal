// logging.go — resilient startup logging for the Forge server binary.
//
// Two field defects live here:
//  1. io.MultiWriter(os.Stdout, logFile) aborts the whole chain the moment the
//     first sink errors. A -H windowsgui binary launched from Explorer has an
//     invalid stdout handle, so every log write died at stdout and forge.log
//     silently stopped receiving output — leaving production incidents with no
//     diagnostics at all. The resilient writer below isolates each sink.
//  2. forge.log was append-only forever and reached 888 MB in the field; the
//     startup rotation below moves an oversized log aside so the active file
//     stays small enough to open and ship.
package main

import (
	"io"
	"os"
)

// maxLogFileSizeBytes is the size at which forge.log is rotated on startup (50 MB).
const maxLogFileSizeBytes = 50 * 1024 * 1024

// rotatedLogSuffix is appended to the log path when an oversized log is moved aside.
const rotatedLogSuffix = ".old"

// bestEffortWriter forwards writes to its sink and swallows any error, so one
// dead sink (e.g. the invalid stdout of a windowsgui process) can never abort
// an io.MultiWriter chain and starve the healthy sinks.
type bestEffortWriter struct {
	sink io.Writer
}

// Write always reports success; the underlying sink's failure is deliberately ignored.
func (writer bestEffortWriter) Write(payload []byte) (int, error) {
	_, _ = writer.sink.Write(payload)
	return len(payload), nil
}

// newResilientLogWriter fans log output out to every sink, isolating each sink's
// failures so logging keeps working as long as at least one sink is healthy.
func newResilientLogWriter(sinks ...io.Writer) io.Writer {
	guardedSinks := make([]io.Writer, 0, len(sinks))
	for _, sink := range sinks {
		guardedSinks = append(guardedSinks, bestEffortWriter{sink: sink})
	}
	return io.MultiWriter(guardedSinks...)
}

// rotateOversizedLog moves the log file aside (to <path>.old, replacing any
// previous rotation) when it exceeds maxSizeBytes. A missing file is a no-op.
func rotateOversizedLog(logPath string, maxSizeBytes int64) error {
	fileInfo, statErr := os.Stat(logPath)
	if statErr != nil || fileInfo.Size() <= maxSizeBytes {
		return nil
	}
	rotatedPath := logPath + rotatedLogSuffix
	_ = os.Remove(rotatedPath)
	return os.Rename(logPath, rotatedPath)
}
