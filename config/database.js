// ====================================
// CONFIGURATION SUPABASE
// ====================================
// Ce fichier gère la connexion à Supabase et l'initialisation de la base de données

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ====================================
// CRÉATION DU CLIENT SUPABASE
// ====================================

// Client avec clé anonyme (pour le frontend)
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Client avec clé service (pour les opérations admin backend)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ====================================
// FONCTION D'INITIALISATION DE LA BASE
// ====================================
// À exécuter une seule fois pour créer toutes les tables

export async function initDatabase() {
  console.log('🔄 Initialisation de la base de données...');

  try {
    // Cette fonction sera appelée au démarrage du serveur
    // Les tables seront créées manuellement via le dashboard Supabase
    // ou via un script SQL (voir database/schema.sql)
    
    console.log('✅ Base de données prête');
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    return false;
  }
}

// ====================================
// FONCTIONS UTILITAIRES
// ====================================

// Vérifier la connexion à Supabase
export async function checkConnection() {
  try {
    const { data, error } = await supabase
      .from('utilisateurs')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    console.log('✅ Connexion à Supabase établie');
    return true;
  } catch (error) {
    console.error('❌ Erreur de connexion à Supabase:', error.message);
    return false;
  }
}

// Créer un utilisateur admin par défaut (à appeler une seule fois)
export async function createDefaultAdmin(bcrypt) {
  try {
    // Vérifier si un admin existe déjà
    const { data: existingAdmin } = await supabaseAdmin
      .from('utilisateurs')
      .select('id')
      .eq('email', 'admin@court-circuit.fr')
      .single();

    if (existingAdmin) {
      console.log('ℹ️  Admin par défaut existe déjà');
      return;
    }

    // Créer l'admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const { error } = await supabaseAdmin
      .from('utilisateurs')
      .insert({
        email: 'admin@court-circuit.fr',
        nom: 'Administrateur',
        prenom: 'Principal',
        mot_de_passe: hashedPassword,
        role: 'admin',
        telephone: '0600000000'
      });

    if (error) throw error;

    console.log('✅ Admin par défaut créé');
    console.log('   📧 Email: admin@court-circuit.fr');
    console.log('   🔑 Mot de passe: admin123');
    console.log('   ⚠️  CHANGEZ CE MOT DE PASSE IMMÉDIATEMENT !');
  } catch (error) {
    console.error('❌ Erreur création admin:', error);
  }
}

// Créer les campus par défaut
export async function createDefaultCampus() {
  try {
    const campusData = [
      {
        nom: 'Campus Jussieu',
        universite: 'Sorbonne Université',
        adresse: '4 Place Jussieu',
        code_postal: '75005',
        ville: 'Paris'
      },
      {
        nom: 'Campus Orsay',
        universite: 'Université Paris-Saclay',
        adresse: 'Rue du Doyen André Guinier',
        code_postal: '91400',
        ville: 'Orsay'
      },
      {
        nom: 'Campus Tolbiac',
        universite: 'Université Paris 1 Panthéon-Sorbonne',
        adresse: '17 Rue de Tolbiac',
        code_postal: '75013',
        ville: 'Paris'
      }
    ];

    for (const campus of campusData) {
      // Vérifier si le campus existe déjà
      const { data: existing } = await supabaseAdmin
        .from('campus')
        .select('id')
        .eq('nom', campus.nom)
        .single();

      if (!existing) {
        await supabaseAdmin.from('campus').insert(campus);
        console.log(`✅ Campus créé: ${campus.nom}`);
      }
    }
  } catch (error) {
    console.error('❌ Erreur création campus:', error);
  }
}

export default supabase;
