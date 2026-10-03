import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import html2canvas from 'html2canvas';
import { ExportAs } from './useExport';

const pdf = vi.hoisted(() => ({
  addImage: vi.fn(),
  ctor: vi.fn(),
}));

vi.mock('html2canvas', () => ({ default: vi.fn() }));
vi.mock('jspdf', () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 200, getHeight: () => 100 } };
    addImage = pdf.addImage;
    __private__ = {
      buildDocument: () => 'doc',
      getArrayBuffer: () => new Uint8Array([7, 8, 9]).buffer,
    };
    constructor(...args: unknown[]) {
      pdf.ctor(...args);
    }
  },
}));

describe('ExportAs', () => {
  beforeEach(() => {
    const canvas = { width: 400, height: 200, toDataURL: () => 'data:image/png;base64,AAEC' };
    vi.mocked(html2canvas).mockResolvedValue(canvas as unknown as HTMLCanvasElement);
    const el = document.createElement('div');
    el.id = 'note-content';
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.getElementById('note-content')?.remove();
  });

  test('does nothing without note content', () => {
    document.getElementById('note-content')?.remove();
    ExportAs('png', '/out.png');
    expect(html2canvas).not.toHaveBeenCalled();
  });

  test('exports an image as raw bytes', async () => {
    ExportAs('png', '/out.png');
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('download_file', { filePath: '/out.png', blob: [0, 1, 2] })
    );
    expect(invoke).toHaveBeenCalledWith('msg_dialog', { title: 'Export', msg: '/out.png' });
  });

  test('exports a pdf sized to the canvas', async () => {
    ExportAs('pdf', '/out.pdf');
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('download_file', { filePath: '/out.pdf', blob: [7, 8, 9] })
    );
    const ratio = window.devicePixelRatio;
    expect(pdf.ctor).toHaveBeenCalledWith('l', 'pt', [400 / ratio, 200 / ratio]);
    expect(pdf.addImage).toHaveBeenCalledWith('data:image/png;base64,AAEC', 'PNG', 0, 0, 200, 100, '', 'FAST');
  });
});
