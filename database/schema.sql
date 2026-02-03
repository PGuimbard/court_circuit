-- ====================================
-- SCHÉMA BASE DE DONNÉES COURT CIRCUIT
-- ====================================
-- À exécuter dans l'éditeur SQL de Supabase
-- Dashboard > SQL Editor > New Query

-- ====================================
-- TABLE: utilisateurs
-- ====================================
CREATE TABLE IF NOT EXISTS utilisateurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  mot_de_passe VARCHAR(255) NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  telephone VARCHAR(20),
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'agriculteur', 'etudiant')),
  id_campus UUID REFERENCES campus(id),
  nom_ferme VARCHAR(255), -- Pour les agriculteurs
  adresse_ferme TEXT, -- Pour les agriculteurs
  description_ferme TEXT, -- Pour les agriculteurs
  photo_profil TEXT, -- URL Cloudinary
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs(email);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_role ON utilisateurs(role);

-- ====================================
-- TABLE: campus
-- ====================================
CREATE TABLE IF NOT EXISTS campus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom VARCHAR(255) NOT NULL,
  universite VARCHAR(255) NOT NULL,
  adresse TEXT NOT NULL,
  code_postal VARCHAR(10) NOT NULL,
  ville VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================
-- TABLE: produits
-- ====================================
CREATE TABLE IF NOT EXISTS produits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_agriculteur UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  nom VARCHAR(255) NOT NULL,
  description TEXT,
  prix DECIMAL(10, 2) NOT NULL CHECK (prix >= 0),
  unite VARCHAR(50) NOT NULL, -- kg, piece, litre, etc.
  categorie VARCHAR(100),
  photo_url TEXT, -- URL Cloudinary
  photo_public_id TEXT, -- ID Cloudinary pour suppression
  disponible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_produits_agriculteur ON produits(id_agriculteur);
CREATE INDEX IF NOT EXISTS idx_produits_disponible ON produits(disponible);

-- ====================================
-- TABLE: livraisons
-- ====================================
CREATE TABLE IF NOT EXISTS livraisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_agriculteur UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  id_campus UUID NOT NULL REFERENCES campus(id),
  seuil_prix DECIMAL(10, 2) NOT NULL CHECK (seuil_prix >= 0),
  
  -- 3 créneaux proposés par l'agriculteur
  creneau_1 TIMESTAMP WITH TIME ZONE NOT NULL,
  creneau_2 TIMESTAMP WITH TIME ZONE NOT NULL,
  creneau_3 TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Créneau validé par l'admin (parmi les 3)
  creneau_valide INTEGER CHECK (creneau_valide IN (1, 2, 3)),
  date_livraison TIMESTAMP WITH TIME ZONE, -- Copie du créneau validé
  
  -- Statuts
  statut VARCHAR(50) DEFAULT 'en_attente' CHECK (statut IN (
    'en_attente',      -- En attente de commandes
    'creneau_valide',  -- Admin a validé un créneau
    'seuil_atteint',   -- Seuil de prix atteint
    'confirmee',       -- Livraison confirmée
    'livree',          -- Livraison effectuée
    'annulee'          -- Annulée (seuil pas atteint)
  )),
  
  total_actuel DECIMAL(10, 2) DEFAULT 0,
  date_limite_commande TIMESTAMP WITH TIME ZONE NOT NULL, -- 10 jours avant le 1er créneau
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_livraisons_agriculteur ON livraisons(id_agriculteur);
CREATE INDEX IF NOT EXISTS idx_livraisons_campus ON livraisons(id_campus);
CREATE INDEX IF NOT EXISTS idx_livraisons_statut ON livraisons(statut);

-- ====================================
-- TABLE: commandes
-- ====================================
CREATE TABLE IF NOT EXISTS commandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_etudiant UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  id_livraison UUID NOT NULL REFERENCES livraisons(id) ON DELETE CASCADE,
  
  montant_total DECIMAL(10, 2) NOT NULL CHECK (montant_total >= 0),
  
  -- Paiement HelloAsso
  statut_paiement VARCHAR(50) DEFAULT 'en_attente' CHECK (statut_paiement IN (
    'en_attente',  -- En attente de paiement
    'paye',        -- Paiement effectué
    'rembourse',   -- Remboursé (seuil pas atteint)
    'annule'       -- Annulé
  )),
  
  helloasso_checkout_intent_id TEXT,
  helloasso_order_id TEXT,
  date_paiement TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_commandes_etudiant ON commandes(id_etudiant);
CREATE INDEX IF NOT EXISTS idx_commandes_livraison ON commandes(id_livraison);
CREATE INDEX IF NOT EXISTS idx_commandes_statut_paiement ON commandes(statut_paiement);

-- ====================================
-- TABLE: lignes_commande
-- ====================================
CREATE TABLE IF NOT EXISTS lignes_commande (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_commande UUID NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  id_produit UUID NOT NULL REFERENCES produits(id),
  
  quantite DECIMAL(10, 2) NOT NULL CHECK (quantite > 0),
  prix_unitaire DECIMAL(10, 2) NOT NULL CHECK (prix_unitaire >= 0),
  sous_total DECIMAL(10, 2) NOT NULL CHECK (sous_total >= 0),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_lignes_commande_commande ON lignes_commande(id_commande);
CREATE INDEX IF NOT EXISTS idx_lignes_commande_produit ON lignes_commande(id_produit);

-- ====================================
-- FONCTIONS & TRIGGERS
-- ====================================

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER update_utilisateurs_updated_at
  BEFORE UPDATE ON utilisateurs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_produits_updated_at
  BEFORE UPDATE ON produits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_livraisons_updated_at
  BEFORE UPDATE ON livraisons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commandes_updated_at
  BEFORE UPDATE ON commandes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- POLITIQUES DE SÉCURITÉ (RLS)
-- ====================================

-- Activer RLS sur toutes les tables
ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus ENABLE ROW LEVEL SECURITY;
ALTER TABLE produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE livraisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lignes_commande ENABLE ROW LEVEL SECURITY;

-- Politique: Tout le monde peut lire les campus
CREATE POLICY "Campus lisibles par tous"
  ON campus FOR SELECT
  USING (true);

-- Politique: Tout le monde peut lire les produits disponibles
CREATE POLICY "Produits lisibles par tous"
  ON produits FOR SELECT
  USING (disponible = true);

-- Note: Les autres politiques seront gérées côté serveur avec la clé service
-- Pour plus de sécurité, vous pouvez ajouter des politiques spécifiques

-- ====================================
-- DONNÉES PAR DÉFAUT
-- ====================================

-- Insérer les campus par défaut
INSERT INTO campus (nom, universite, adresse, code_postal, ville) VALUES
  ('Campus Jussieu', 'Sorbonne Université', '4 Place Jussieu', '75005', 'Paris'),
  ('Campus Orsay', 'Université Paris-Saclay', 'Rue du Doyen André Guinier', '91400', 'Orsay'),
  ('Campus Tolbiac', 'Université Paris 1 Panthéon-Sorbonne', '17 Rue de Tolbiac', '75013', 'Paris')
ON CONFLICT DO NOTHING;

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ Schéma de base de données créé avec succès !';
  RAISE NOTICE 'Prochaine étape : Créer l''utilisateur admin via le serveur Node.js';
END $$;
