import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VisualDiffViewer } from './VisualDiffViewer';

function makeFile(name: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

function pickFile(input: HTMLInputElement, file: File): void {
  // jsdom 24+ doesn't fire File input updates via fireEvent.upload unless
  // we mutate input.files. We defineProperty + fireEvent.change to keep
  // the picker pure React and free of @testing-library/user-event.
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.change(input);
}

function pickBoth(a: File, b: File): void {
  const inputs = screen.getAllByTestId('visualdiff-file-input') as HTMLInputElement[];
  pickFile(inputs[0]!, a);
  pickFile(inputs[1]!, b);
}

describe('VisualDiffViewer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('disables submit until both images selected', () => {
    render(<VisualDiffViewer />);
    const submit = screen.getByRole('button', { name: /开始对比/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('submits a comparison and renders the verdict badge', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            match: false,
            diffRatio: 0.0823,
            diffPixels: 8210,
            total: 100000,
            width: 200,
            height: 250,
            latencyMS: 18,
            cacheKey: 'kABC',
            diffPng: 'BASE64',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    render(<VisualDiffViewer />);
    pickBoth(
      makeFile('before.png', [0x89, 0x50, 0x4e, 0x47]),
      makeFile('after.png', [0x89, 0x50, 0x4e, 0x47, 0x01]),
    );
    const submit = screen.getByRole('button', { name: /开始对比/ }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    const verdict = await screen.findByTestId('visualdiff-verdict');
    expect(verdict.textContent ?? '').toMatch(/差异/);
    expect(verdict.getAttribute('data-tone')).toMatch(/warn|fail/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.before.length).toBeGreaterThan(0);
    expect(body.after.length).toBeGreaterThan(0);
    expect(body.highlight).toBe(true);
  });

  it('renders pass verdict when match is true', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            match: true,
            diffRatio: 0,
            diffPixels: 0,
            total: 100,
            width: 10,
            height: 10,
            latencyMS: 5,
            cacheKey: 'kPASS',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    render(<VisualDiffViewer />);
    pickBoth(makeFile('a.png', [0x01]), makeFile('b.png', [0x01]));
    const submitPass = screen.getByRole('button', { name: /开始对比/ }) as HTMLButtonElement;
    await waitFor(() => expect(submitPass.disabled).toBe(false));
    fireEvent.click(submitPass);
    const verdict = await screen.findByTestId('visualdiff-verdict');
    expect(verdict.getAttribute('data-tone')).toBe('pass');
    expect(verdict.textContent ?? '').toContain('通过');
  });

  it('surfaces backend error message', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'before 必须是 base64 PNG' }), { status: 400 }),
    );
    render(<VisualDiffViewer />);
    pickBoth(makeFile('a.png', [0x01]), makeFile('b.png', [0x01]));
    const submitErr = screen.getByRole('button', { name: /开始对比/ }) as HTMLButtonElement;
    await waitFor(() => expect(submitErr.disabled).toBe(false));
    fireEvent.click(submitErr);
    const banner = await screen.findByText(/对比失败/);
    expect(banner.textContent ?? '').toContain('before');
    expect(banner.textContent ?? '').toContain('400');
  });

  it('honors readOnly by hiding file pickers', () => {
    render(<VisualDiffViewer readOnly initialBefore="AAAA" initialAfter="BBBB" />);
    expect(screen.queryAllByTestId('visualdiff-file-input')).toHaveLength(0);
    const submit = screen.getByRole('button', { name: /开始对比/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});