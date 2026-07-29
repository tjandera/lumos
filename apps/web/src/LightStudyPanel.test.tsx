import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';

const getLightStudyStatus = vi.fn();
const relightFrame = vi.fn();
vi.mock('./api/client', () => ({
  getLightStudyStatus: (...a: unknown[]) => getLightStudyStatus(...a),
  relightFrame: (...a: unknown[]) => relightFrame(...a),
}));

// Imported after the mock so the panel picks up the stubbed client.
const { LightStudyPanel } = await import('./LightStudyPanel');
const { useUiStore } = await import('./uiStore');

const RENDER_SRC = 'data:image/jpeg;base64,RENDERED';
const RELIT_SRC = 'data:image/png;base64,RELIT';

/** Two captured hours, as `LightStudyCapture` would leave them. */
function seedFrames() {
  useUiStore.setState({
    lightStudyOpen: true,
    lightStudyBusy: false,
    lightStudyFrames: [
      { minutes: 0, dataUrl: RENDER_SRC + '0' },
      { minutes: 540, dataUrl: RENDER_SRC + '9' },
    ],
    lightStudyIndex: 1,
    lightStudyPlaying: false,
    mode: '3d',
  });
}

describe('LightStudyPanel photoreal pass', () => {
  beforeEach(() => {
    getLightStudyStatus.mockReset();
    relightFrame.mockReset();
    getLightStudyStatus.mockResolvedValue({
      available: true,
      mock: false,
      presets: [
        { id: 'golden', label: 'Golden hour' },
        { id: 'dusk', label: 'Dusk' },
      ],
    });
    relightFrame.mockResolvedValue({ imageDataUrl: RELIT_SRC, preset: 'golden', mock: false });
    seedFrames();
  });

  afterEach(() => {
    // This project runs vitest with `globals: false`, so testing-library's automatic
    // cleanup never registers and rendered panels would otherwise pile up across tests.
    cleanup();
    useUiStore.setState({ lightStudyOpen: false, lightStudyFrames: [], lightStudyIndex: 0 });
  });

  test('shows the captured render for the selected hour', async () => {
    render(<LightStudyPanel />);
    expect(await screen.findByAltText('Room at 09:00')).toHaveProperty('src', RENDER_SRC + '9');
  });

  test('offers the server-advertised presets once available', async () => {
    render(<LightStudyPanel />);
    expect(await screen.findByRole('button', { name: 'Golden hour' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dusk' })).toBeTruthy();
  });

  test('sends the current frame to be re-lit and shows the result', async () => {
    const user = userEvent.setup();
    render(<LightStudyPanel />);
    await user.click(await screen.findByRole('button', { name: 'Golden hour' }));

    await waitFor(() => expect(relightFrame).toHaveBeenCalledTimes(1));
    // It must send the frame the slider is on, not the first one.
    expect(relightFrame).toHaveBeenCalledWith(RENDER_SRC + '9', 'golden');
    await waitFor(() => expect(screen.getByAltText('Room at 09:00')).toHaveProperty('src', RELIT_SRC));
  });

  test('labels the result so a generated image is never mistaken for the render', async () => {
    const user = userEvent.setup();
    render(<LightStudyPanel />);
    await user.click(await screen.findByRole('button', { name: 'Golden hour' }));
    expect(await screen.findByText(/AI re-lit/)).toBeTruthy();
  });

  test('caches per frame+preset — flipping back costs nothing', async () => {
    const user = userEvent.setup();
    render(<LightStudyPanel />);
    await user.click(await screen.findByRole('button', { name: 'Golden hour' }));
    await waitFor(() => expect(relightFrame).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Render' })); // back to the real render
    await waitFor(() => expect(screen.getByAltText('Room at 09:00')).toHaveProperty('src', RENDER_SRC + '9'));

    await user.click(screen.getByRole('button', { name: 'Golden hour' }));
    await waitFor(() => expect(screen.getByAltText('Room at 09:00')).toHaveProperty('src', RELIT_SRC));
    // Still one call: the second view came from the cache.
    expect(relightFrame).toHaveBeenCalledTimes(1);
  });

  test('surfaces a failure inline instead of throwing', async () => {
    relightFrame.mockRejectedValue(new Error('Too many requests — try again shortly.'));
    const user = userEvent.setup();
    render(<LightStudyPanel />);
    await user.click(await screen.findByRole('button', { name: 'Golden hour' }));
    expect(await screen.findByText(/Too many requests/)).toBeTruthy();
    // The real render stays on screen — a failed styling pass must not lose the study.
    expect(screen.getByAltText('Room at 09:00')).toHaveProperty('src', RENDER_SRC + '9');
  });

  test('hides the photoreal controls when the server has no key', async () => {
    getLightStudyStatus.mockResolvedValue({ available: false, mock: false, presets: [] });
    render(<LightStudyPanel />);
    expect(await screen.findByAltText('Room at 09:00')).toBeTruthy();
    expect(screen.queryByText(/Photoreal pass/)).toBeNull();
  });

  test('survives the API being unreachable — the day cycle is local', async () => {
    getLightStudyStatus.mockRejectedValue(new Error('network down'));
    render(<LightStudyPanel />);
    expect(await screen.findByAltText('Room at 09:00')).toBeTruthy();
    expect(screen.queryByText(/Photoreal pass/)).toBeNull();
  });

  test('scrubbing to another hour drops back to that hour’s real render', async () => {
    const user = userEvent.setup();
    render(<LightStudyPanel />);
    await user.click(await screen.findByRole('button', { name: 'Golden hour' }));
    await waitFor(() => expect(screen.getByAltText('Room at 09:00')).toHaveProperty('src', RELIT_SRC));

    useUiStore.getState().setLightStudyIndex(0);

    await waitFor(() => expect(screen.getByAltText('Room at 00:00')).toHaveProperty('src', RENDER_SRC + '0'));
  });
});
