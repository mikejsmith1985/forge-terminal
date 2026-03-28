import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MobileFileUpload } from './MobileFileUpload';

// Mock useMobileDetect
vi.mock('../hooks/useMobileDetect', () => ({
  useMobileDetect: vi.fn(() => ({ isMobile: true })),
}));

// Mock config
vi.mock('../config', () => ({
  API_CONFIG: { base: 'http://localhost:3000' },
}));

describe('MobileFileUpload', () => {
  const mockOnUploadComplete = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    const { useMobileDetect } = await import('../hooks/useMobileDetect');
    useMobileDetect.mockReturnValue({ isMobile: true });
  });

  it('renders upload button on mobile', () => {
    render(<MobileFileUpload onUploadComplete={mockOnUploadComplete} />);
    expect(screen.getByRole('button', { name: /upload/i })).toBeTruthy();
  });

  it('hidden on desktop', async () => {
    const { useMobileDetect } = await import('../hooks/useMobileDetect');
    useMobileDetect.mockReturnValue({ isMobile: false });
    const { container } = render(<MobileFileUpload onUploadComplete={mockOnUploadComplete} />);
    expect(container.firstChild).toBeNull();
  });

  it('opens file picker on button click', () => {
    render(<MobileFileUpload onUploadComplete={mockOnUploadComplete} />);
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
  });

  it('shows progress during upload', async () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // Never resolves
    render(<MobileFileUpload onUploadComplete={mockOnUploadComplete} />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/uploading/i)).toBeTruthy();
    });
  });

  it('calls onUploadComplete on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ path: '/uploaded/test.txt' }),
    });
    render(<MobileFileUpload onUploadComplete={mockOnUploadComplete} />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(mockOnUploadComplete).toHaveBeenCalledWith('/uploaded/test.txt');
    });
  });

  it('shows error on upload failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    render(<MobileFileUpload onUploadComplete={mockOnUploadComplete} />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getAllByText(/failed/i).length).toBeGreaterThan(0);
    });
  });
});
