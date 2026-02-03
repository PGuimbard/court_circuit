// ====================================
// CONFIGURATION CLOUDINARY
// ====================================
// Ce fichier gère l'upload d'images sur Cloudinary

import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// ====================================
// CONFIGURATION
// ====================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ====================================
// FONCTION D'UPLOAD D'IMAGE
// ====================================

/**
 * Upload une image sur Cloudinary
 * @param {Buffer} fileBuffer - Le buffer du fichier
 * @param {string} folder - Dossier de destination (ex: 'produits')
 * @returns {Promise<Object>} - URL de l'image uploadée
 */
export async function uploadImage(fileBuffer, folder = 'produits') {
  return new Promise((resolve, reject) => {
    // Créer un stream d'upload
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `court-circuit/${folder}`,
        transformation: [
          { width: 800, height: 800, crop: 'limit' }, // Limiter la taille
          { quality: 'auto' }, // Optimisation automatique
          { fetch_format: 'auto' } // Format automatique (WebP si supporté)
        ]
      },
      (error, result) => {
        if (error) {
          console.error('❌ Erreur upload Cloudinary:', error);
          reject(error);
        } else {
          console.log('✅ Image uploadée:', result.secure_url);
          resolve({
            url: result.secure_url,
            public_id: result.public_id
          });
        }
      }
    );

    // Envoyer le buffer au stream
    uploadStream.end(fileBuffer);
  });
}

/**
 * Supprimer une image de Cloudinary
 * @param {string} publicId - L'ID public de l'image
 */
export async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('✅ Image supprimée:', publicId);
    return result;
  } catch (error) {
    console.error('❌ Erreur suppression Cloudinary:', error);
    throw error;
  }
}

/**
 * Obtenir l'URL optimisée d'une image
 * @param {string} publicId - L'ID public de l'image
 * @param {Object} options - Options de transformation
 */
export function getOptimizedUrl(publicId, options = {}) {
  return cloudinary.url(publicId, {
    transformation: [
      { width: options.width || 400, height: options.height || 400, crop: 'fill' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  });
}

export default cloudinary;
