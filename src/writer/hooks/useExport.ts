import { invoke } from '@tauri-apps/api/core';

// html2canvas and jspdf are big (~0.55MB): loaded on export, not on start

export function ExportAs(as: string, filePath: string) {
  const pixelRatio = window.devicePixelRatio;
  const note = document.getElementById("note-content");
  if (!note) return;

  import('html2canvas').then(({ default: html2canvas }) => html2canvas(note)).then(async function (canvas) {
    const imgData = canvas.toDataURL("image/png");
    requestAnimationFrame(() => {
      if (as === 'pdf') {
        handlePdf(imgData, canvas, pixelRatio, filePath);
      } else {
        handleImg(imgData, filePath);
      }
    });
    await invoke('msg_dialog', { title: "Export", msg: filePath });
  });
}

async function handleImg(imgData: string, filePath: string) {
  const binaryData = atob(imgData.split("base64,")[1]);
  const data = [];
  for (let i = 0; i < binaryData.length; i++) {
    data.push(binaryData.charCodeAt(i));
  }
  await invoke('download_file', { filePath, blob: data });
}

async function handlePdf(
  imgData: string, 
  canvas: HTMLCanvasElement, 
  pixelRatio: number, 
  filePath: string,
) {
  const { jsPDF } = await import('jspdf');
  const orientation = canvas.width > canvas.height ? "l" : "p";
  const pdf = new jsPDF(orientation, "pt", [
    canvas.width / pixelRatio,
    canvas.height / pixelRatio,
  ]);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight, '', 'FAST');
  
  const data = pdf.output('arraybuffer');
  await invoke('download_file', { filePath, blob: Array.from(new Uint8Array(data)) });
}
