/**
 * Utility functions for image validation and client-side canvas compression.
 * Centralized to avoid code duplication across CameraModule, NewPlantModal, and PlantDiagnosisModal.
 */

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates file format and size before compression.
 * Specifically handles and detects unsupported HEIC/HEIF files with clear user guidance.
 */
export function validateImageFile(file: File): ImageValidationResult {
  if (!file) {
    return { valid: false, error: 'Nenhum arquivo selecionado.' };
  }

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  // HEIC/HEIF detection
  const isHeic =
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    type === 'image/heic' ||
    type === 'image/heif';

  if (isHeic) {
    return {
      valid: false,
      error:
        'O formato HEIC/HEIF não é suportado diretamente pelo navegador. Por favor, envie a foto em formato JPEG, PNG ou WebP (você pode ajustar a câmera do celular para "Mais Compatível / JPEG" ou exportar da galeria como JPEG).',
    };
  }

  // Check supported mime types
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const hasAllowedExt = allowedExtensions.some((ext) => name.endsWith(ext));
  const isImageMime = type.startsWith('image/');

  if (!isImageMime && !hasAllowedExt) {
    return {
      valid: false,
      error: 'Formato de arquivo não suportado. Por favor, selecione uma foto JPEG, PNG ou WebP.',
    };
  }

  // Maximum initial file size (15MB pre-compression)
  const maxBytes = 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `A imagem selecionada é muito grande (${(file.size / (1024 * 1024)).toFixed(1)} MB). O limite inicial é de 15 MB.`,
    };
  }

  return { valid: true };
}

/**
 * Resizes and compresses an image File using the HTML5 Canvas API.
 * Produces a lightweight JPEG base64 Data URL (~200KB - 350KB), ideal for mobile networks and Vercel payloads.
 */
export function compressImage(
  file: File,
  maxDim = 1200,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return reject(new Error(validation.error));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      img.onerror = () => reject(new Error('Falha ao decodificar a imagem no navegador. O formato pode ser incompatível.'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Erro na leitura do arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}
