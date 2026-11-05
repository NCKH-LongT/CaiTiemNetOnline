export async function compressChatImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Chọn ảnh PNG, JPEG hoặc WebP.');
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = url;
    await image.decode();
    for (const maxEdge of [1280, 960, 720, 560, 420, 300, 200]) {
      const ratio = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Trình duyệt không thể nén ảnh.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.7, 0.55, 0.4, 0.3]) {
        const data = canvas.toDataURL('image/webp', quality);
        if (data.length < 1_200_000) return data;
      }
    }
    throw new Error('Ảnh chat sau khi nén vẫn quá lớn.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
