const accepted = ['image/png', 'image/jpeg', 'image/webp'];

export async function compressDesktopImage(file: File): Promise<string> {
  if (!accepted.includes(file.type) || file.size > 20_000_000)
    throw new Error('Chọn ảnh PNG, JPEG hoặc WebP dưới 20 MB.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 1600 / image.naturalWidth, 1200 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Trình duyệt không thể nén ảnh.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.68, 0.5, 0.35]) {
      const data = canvas.toDataURL('image/webp', quality);
      if (data.length < 2_600_000) return data;
    }
    throw new Error('Ảnh sau khi nén vẫn vượt 2 MB. Hãy chọn ảnh nhỏ hơn.');
  } catch (cause) {
    if (cause instanceof Error && cause.message !== 'The source image cannot be decoded.') throw cause;
    throw new Error('Không đọc được ảnh đã chọn.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
