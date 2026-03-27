package main

import (
	"fmt"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

// GenerateTerminalQR generates a QR code rendered with Unicode block characters
// for display in a terminal. Uses half-block characters to pack 2 pixels per row,
// making the output more compact and square-looking.
func GenerateTerminalQR(url string) (string, error) {
	if url == "" {
		return "", fmt.Errorf("URL cannot be empty")
	}

	qr, err := qrcode.New(url, qrcode.Medium)
	if err != nil {
		return "", fmt.Errorf("failed to generate QR code: %w", err)
	}
	qr.DisableBorder = false

	bitmap := qr.Bitmap()
	rows := len(bitmap)
	if rows == 0 {
		return "", fmt.Errorf("QR code bitmap is empty")
	}
	cols := len(bitmap[0])

	var sb strings.Builder

	// Half-block encoding packs 2 vertical pixels per character line:
	//   █ = top black, bottom black
	//   ▀ = top black, bottom white
	//   ▄ = top white, bottom black
	//     = top white, bottom white (space)
	for y := 0; y < rows; y += 2 {
		for x := 0; x < cols; x++ {
			top := bitmap[y][x]
			var bottom bool
			if y+1 < rows {
				bottom = bitmap[y+1][x]
			}

			switch {
			case top && bottom:
				sb.WriteRune('█')
			case top && !bottom:
				sb.WriteRune('▀')
			case !top && bottom:
				sb.WriteRune('▄')
			default:
				sb.WriteRune(' ')
			}
		}
		sb.WriteRune('\n')
	}

	return sb.String(), nil
}
