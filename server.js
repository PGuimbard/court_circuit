// ====================================
// SERVEUR PRINCIPAL - COURT CIRCUIT
// ====================================

import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { promises as fs } from 'fs';

// Import des configurations
import { supabaseAdmin, checkConnection, createDefaultAdmin, createDefaultCampus } from './config/database.js';
import { uploadImage, deleteImage } from './config/cloudinary.js';

// Configuration ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



// Charger les variables d'environnement
dotenv.config();

// ====================================
// CONFIGURATION EXPRESS
// ====================================
const app = express();
const PORT = process.env.PORT || 3000;

// ✅ IMPORTANT : Faire confiance au proxy de Render pour les sessions HTTPS
app.set('trust proxy', 1);

// Middleware
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json()); // ✅ for JSON bodies (fetch, API)
app.use(express.urlencoded({ extended: true })); // ✅ for HTML forms


// Configuration des sessions - Adaptée pour Render
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-par-defaut-a-changer',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS en production
    httpOnly: true, // Protection XSS
    maxAge: 24 * 60 * 60 * 1000, // 24 heures
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // Important pour HTTPS
  },
  proxy: true // ✅ CRITIQUE pour Render !
}));

// Configuration Multer pour upload temporaire (avant Cloudinary)
const storage = multer.memoryStorage(); // Stocker en mémoire
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    // Accepter uniquement les images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images sont acceptées'));
    }
  }
});

// ====================================
// MIDDLEWARE D'AUTHENTIFICATION
// ====================================

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.userId || !roles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    next();
  };
}

// ====================================
// HELPER FUNCTION POUR SERVIR LES FICHIERS HTML
// ====================================

async function serveHTMLFile(res, filename) {
  try {
    const filePath = path.join(__dirname, 'views', filename);
    
    // Vérifier que le fichier existe
    await fs.access(filePath);
    
    // Envoyer le fichier
    res.sendFile(filePath);
  } catch (error) {
    console.error(`Erreur lors du chargement de ${filename}:`, error);
    res.status(404).send(`
      <html>
        <body>
          <h1>Erreur 404</h1>
          <p>Le fichier ${filename} est introuvable.</p>
          <p>Chemin recherché: ${path.join(__dirname, 'views', filename)}</p>
          <p><a href="/">Retour à l'accueil</a></p>
        </body>
      </html>
    `);
  }
}

// ====================================
// ROUTES PAGES HTML
// ====================================

app.get('/', (req, res) => {
  serveHTMLFile(res, 'index.html');
});

app.get('/login', (req, res) => {
  serveHTMLFile(res, 'login.html');
});

app.get('/register', (req, res) => {
  serveHTMLFile(res, 'register.html');
});

app.get('/admin', requireAuth, requireRole('admin'), (req, res) => {
  serveHTMLFile(res, 'admin.html');
});

app.get('/agriculteur', requireAuth, requireRole('agriculteur'), (req, res) => {
  serveHTMLFile(res, 'agriculteur.html');
});

app.get('/etudiant', requireAuth, requireRole('etudiant'), (req, res) => {
  serveHTMLFile(res, 'etudiant.html');
});

// ====================================
// ROUTES API - AUTHENTIFICATION
// ====================================

// Inscription étudiant
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, mot_de_passe, nom, prenom, telephone, id_campus } = req.body;

    // Validation
    if (!email || !mot_de_passe || !nom || !prenom || !id_campus) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Vérifier si l'email existe déjà
    const { data: existingUser } = await supabaseAdmin
      .from('utilisateurs')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(mot_de_passe, 10);

    // Créer l'utilisateur
    const { data, error } = await supabaseAdmin
      .from('utilisateurs')
      .insert({
        email,
        mot_de_passe: hashedPassword,
        nom,
        prenom,
        telephone,
        role: 'etudiant',
        id_campus
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Inscription réussie', userId: data.id });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// Connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, mot_de_passe } = req.body;

    // Récupérer l'utilisateur
    const { data: user, error } = await supabaseAdmin
      .from('utilisateurs')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(mot_de_passe, user.mot_de_passe);

    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Créer la session
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.email = user.email;
    req.session.nom = user.nom;
    req.session.prenom = user.prenom;

    res.json({
      message: 'Connexion réussie',
      role: user.role,
      redirectUrl: `/${user.role}`
    });
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

// Déconnexion
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la déconnexion' });
    }
    res.json({ message: 'Déconnexion réussie' });
  });
});

// Vérifier la session
app.get('/api/auth/check', requireAuth, (req, res) => {
  res.json({
    authenticated: true,
    userId: req.session.userId,
    role: req.session.role,
    nom: req.session.nom,
    prenom: req.session.prenom
  });
});

// ====================================
// ROUTES API - CAMPUS
// ====================================

// Liste des campus
app.get('/api/campus', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('campus')
      .select('*')
      .order('nom');

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur récupération campus:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des campus' });
  }
});

// ====================================
// ROUTES API - PRODUITS
// ====================================

// Liste des produits (tous ou par agriculteur)
app.get('/api/produits', async (req, res) => {
  try {
    const { id_agriculteur } = req.query;

    let query = supabaseAdmin
      .from('produits')
      .select(`
        *,
        agriculteur:utilisateurs(nom, prenom, nom_ferme)
      `)
      .eq('disponible', true)
      .order('created_at', { ascending: false });

    if (id_agriculteur) {
      query = query.eq('id_agriculteur', id_agriculteur);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur récupération produits:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des produits' });
  }
});

// Ajouter un produit
app.post('/api/produits', requireAuth, requireRole('agriculteur'), upload.single('photo'), async (req, res) => {
  try {
    const { nom, description, prix, unite, quantite_disponible, categorie } = req.body;
    const id_agriculteur = req.session.userId;

    // Validation
    if (!nom || !prix || !unite) {
      return res.status(400).json({ error: 'Nom, prix et unité sont requis' });
    }

    let photo_url = null;

    // Upload vers Cloudinary si une photo est fournie
    if (req.file) {
      const cloudinaryResult = await uploadImage(req.file.buffer, 'produits');
      photo_url = cloudinaryResult.secure_url;
    }

    // Créer le produit
    const { data, error } = await supabaseAdmin
      .from('produits')
      .insert({
        id_agriculteur,
        nom,
        description,
        prix,
        unite,
        quantite_disponible,
        categorie,
        photo_url,
        disponible: true
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Produit ajouté', produit: data });
  } catch (error) {
    console.error('Erreur ajout produit:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du produit' });
  }
});

// Modifier un produit
app.put('/api/produits/:id', requireAuth, requireRole('agriculteur'), upload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, description, prix, unite, quantite_disponible, categorie, disponible } = req.body;
    const id_agriculteur = req.session.userId;

    // Vérifier que le produit appartient à l'agriculteur
    const { data: produit, error: checkError } = await supabaseAdmin
      .from('produits')
      .select('*')
      .eq('id', id)
      .eq('id_agriculteur', id_agriculteur)
      .single();

    if (checkError || !produit) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    const updates = {
      nom: nom || produit.nom,
      description: description || produit.description,
      prix: prix || produit.prix,
      unite: unite || produit.unite,
      quantite_disponible: quantite_disponible !== undefined ? quantite_disponible : produit.quantite_disponible,
      categorie: categorie || produit.categorie,
      disponible: disponible !== undefined ? disponible : produit.disponible
    };

    // Gérer la nouvelle photo si fournie
    if (req.file) {
      // Supprimer l'ancienne photo de Cloudinary si elle existe
      if (produit.photo_url) {
        await deleteImage(produit.photo_url);
      }

      // Upload la nouvelle
      const cloudinaryResult = await uploadImage(req.file.buffer, 'produits');
      updates.photo_url = cloudinaryResult.secure_url;
    }

    const { data, error } = await supabaseAdmin
      .from('produits')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Produit modifié', produit: data });
  } catch (error) {
    console.error('Erreur modification produit:', error);
    res.status(500).json({ error: 'Erreur lors de la modification du produit' });
  }
});

// Supprimer un produit
app.delete('/api/produits/:id', requireAuth, requireRole('agriculteur'), async (req, res) => {
  try {
    const { id } = req.params;
    const id_agriculteur = req.session.userId;

    // Récupérer le produit pour avoir l'URL de la photo
    const { data: produit } = await supabaseAdmin
      .from('produits')
      .select('photo_url')
      .eq('id', id)
      .eq('id_agriculteur', id_agriculteur)
      .single();

    // Supprimer la photo de Cloudinary si elle existe
    if (produit?.photo_url) {
      await deleteImage(produit.photo_url);
    }

    const { error } = await supabaseAdmin
      .from('produits')
      .delete()
      .eq('id', id)
      .eq('id_agriculteur', id_agriculteur);

    if (error) throw error;

    res.json({ message: 'Produit supprimé' });
  } catch (error) {
    console.error('Erreur suppression produit:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du produit' });
  }
});

// ====================================
// ROUTES API - LIVRAISONS
// ====================================

// Liste des livraisons
app.get('/api/livraisons', requireAuth, async (req, res) => {
  try {
    const { role, userId } = req.session;
    const { statut } = req.query;

    let query = supabaseAdmin
      .from('livraisons')
      .select(`
        *,
        agriculteur:utilisateurs!livraisons_id_agriculteur_fkey(nom, prenom, nom_ferme),
        campus(nom, ville),
        commandes(id, montant_total)
      `)
      .order('created_at', { ascending: false });

    // Filtrer selon le rôle
    if (role === 'agriculteur') {
      query = query.eq('id_agriculteur', userId);
    } else if (role === 'etudiant') {
      // Pour l'étudiant, on peut montrer les livraisons de son campus
      const { data: user } = await supabaseAdmin
        .from('utilisateurs')
        .select('id_campus')
        .eq('id', userId)
        .single();

      if (user?.id_campus) {
        query = query.eq('id_campus', user.id_campus);
      }
    }

    if (statut) {
      query = query.eq('statut', statut);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur récupération livraisons:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des livraisons' });
  }
});

// Créer une livraison
app.post('/api/livraisons', requireAuth, requireRole('agriculteur'), async (req, res) => {
  try {
    const { 
      id_campus, 
      seuil_prix, 
      creneau_propose_1, 
      creneau_propose_2, 
      creneau_propose_3 
    } = req.body;
    
    const id_agriculteur = req.session.userId;

    // Validation
    if (!id_campus || !seuil_prix || !creneau_propose_1 || !creneau_propose_2 || !creneau_propose_3) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Créer la livraison
    const { data, error } = await supabaseAdmin
      .from('livraisons')
      .insert({
        id_agriculteur,
        id_campus,
        seuil_prix,
        creneau_propose_1,
        creneau_propose_2,
        creneau_propose_3,
        statut: 'en_attente',
        montant_actuel: 0
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Livraison créée', livraison: data });
  } catch (error) {
    console.error('Erreur création livraison:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la livraison' });
  }
});

// Valider un créneau (admin uniquement)
app.post('/api/livraisons/:id/valider-creneau', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { creneau_choisi } = req.body;

    if (!['creneau_propose_1', 'creneau_propose_2', 'creneau_propose_3'].includes(creneau_choisi)) {
      return res.status(400).json({ error: 'Créneau invalide' });
    }

    // Récupérer la livraison
    const { data: livraison, error: fetchError } = await supabaseAdmin
      .from('livraisons')
      .select(creneau_choisi)
      .eq('id', id)
      .single();

    if (fetchError || !livraison) {
      return res.status(404).json({ error: 'Livraison non trouvée' });
    }

    const { data, error } = await supabaseAdmin
      .from('livraisons')
      .update({
        date_livraison: livraison[creneau_choisi],
        statut: 'creneau_valide'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Créneau validé', livraison: data });
  } catch (error) {
    console.error('Erreur validation créneau:', error);
    res.status(500).json({ error: 'Erreur lors de la validation du créneau' });
  }
});

// Marquer comme livrée
app.post('/api/livraisons/:id/marquer-livree', requireAuth, requireRole('admin', 'agriculteur'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('livraisons')
      .update({
        statut: 'livree',
        date_livraison_reelle: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Livraison marquée comme livrée', livraison: data });
  } catch (error) {
    console.error('Erreur marquage livraison:', error);
    res.status(500).json({ error: 'Erreur lors du marquage de la livraison' });
  }
});

// ====================================
// ROUTES API - COMMANDES
// ====================================

// Créer une commande
app.post('/api/commandes', requireAuth, requireRole('etudiant'), async (req, res) => {
  try {
    const { id_livraison, items } = req.body;
    const id_etudiant = req.session.userId;

    // Validation
    if (!id_livraison || !items || items.length === 0) {
      return res.status(400).json({ error: 'Livraison et produits requis' });
    }

    // Vérifier que la livraison est disponible
    const { data: livraison, error: livraisonError } = await supabaseAdmin
      .from('livraisons')
      .select('*')
      .eq('id', id_livraison)
      .single();

    if (livraisonError || !livraison) {
      return res.status(404).json({ error: 'Livraison non trouvée' });
    }

    if (livraison.statut === 'annulee') {
      return res.status(400).json({ error: 'Cette livraison est annulée' });
    }

    // Calculer le montant total
    let montant_total = 0;
    const produitsDetails = [];

    for (const item of items) {
      const { data: produit } = await supabaseAdmin
        .from('produits')
        .select('*')
        .eq('id', item.id_produit)
        .single();

      if (!produit) {
        return res.status(404).json({ error: `Produit ${item.id_produit} non trouvé` });
      }

      const prix_ligne = parseFloat(produit.prix) * item.quantite;
      montant_total += prix_ligne;

      produitsDetails.push({
        id_produit: item.id_produit,
        quantite: item.quantite,
        prix_unitaire: produit.prix,
        prix_total: prix_ligne
      });
    }

    // Créer la commande
    const { data: commande, error: commandeError } = await supabaseAdmin
      .from('commandes')
      .insert({
        id_etudiant,
        id_livraison,
        montant_total,
        statut_paiement: 'en_attente',
        details: produitsDetails
      })
      .select()
      .single();

    if (commandeError) throw commandeError;

    // Mettre à jour le montant actuel de la livraison
    const { error: updateError } = await supabaseAdmin
      .from('livraisons')
      .update({
        montant_actuel: parseFloat(livraison.montant_actuel) + montant_total
      })
      .eq('id', id_livraison);

    if (updateError) throw updateError;

    res.json({ 
      message: 'Commande créée', 
      commande,
      montant_total
    });
  } catch (error) {
    console.error('Erreur création commande:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la commande' });
  }
});

// Liste des commandes
app.get('/api/commandes', requireAuth, async (req, res) => {
  try {
    const { role, userId } = req.session;

    let query = supabaseAdmin
      .from('commandes')
      .select(`
        *,
        etudiant:utilisateurs!commandes_id_etudiant_fkey(nom, prenom, email),
        livraison:livraisons(
          *,
          agriculteur:utilisateurs!livraisons_id_agriculteur_fkey(nom, prenom, nom_ferme),
          campus(nom, ville)
        )
      `)
      .order('created_at', { ascending: false });

    // Filtrer selon le rôle
    if (role === 'etudiant') {
      query = query.eq('id_etudiant', userId);
    } else if (role === 'agriculteur') {
      // Pour l'agriculteur : commandes liées à ses livraisons
      const { data: livraisons } = await supabaseAdmin
        .from('livraisons')
        .select('id')
        .eq('id_agriculteur', userId);

      const livraisonIds = livraisons.map(l => l.id);
      query = query.in('id_livraison', livraisonIds);
    }
    // Admin voit toutes les commandes (pas de filtre)

    const { data, error } = await query;

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur récupération commandes:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des commandes' });
  }
});

// Simuler un paiement (mode développement uniquement)
app.post('/api/commandes/:id/simuler-paiement', requireAuth, async (req, res) => {
  try {
    // Vérifier qu'on est en mode développement
    if (process.env.DEV_MODE !== 'true') {
      return res.status(403).json({ error: 'Cette route n\'est disponible qu\'en mode développement' });
    }

    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('commandes')
      .update({
        statut_paiement: 'paye',
        date_paiement: new Date().toISOString(),
        helloasso_order_id: `DEV_ORDER_${Date.now()}`
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Paiement simulé avec succès', commande: data });
  } catch (error) {
    console.error('Erreur simulation paiement:', error);
    res.status(500).json({ error: 'Erreur lors de la simulation du paiement' });
  }
});

// ====================================
// ROUTES API - STATISTIQUES
// ====================================

// Stats globales (admin uniquement)
app.get('/api/stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Nombre total d'utilisateurs par rôle
    const { data: users } = await supabaseAdmin
      .from('utilisateurs')
      .select('role');

    const stats = {
      total_utilisateurs: users.length,
      total_etudiants: users.filter(u => u.role === 'etudiant').length,
      total_agriculteurs: users.filter(u => u.role === 'agriculteur').length,
      total_admins: users.filter(u => u.role === 'admin').length
    };

    // Nombre de produits
    const { count: produitsCount } = await supabaseAdmin
      .from('produits')
      .select('*', { count: 'exact', head: true });
    stats.total_produits = produitsCount;

    // Nombre de livraisons par statut
    const { data: livraisons } = await supabaseAdmin
      .from('livraisons')
      .select('statut');

    stats.livraisons_en_attente = livraisons.filter(l => l.statut === 'en_attente').length;
    stats.livraisons_confirmees = livraisons.filter(l => l.statut === 'confirmee').length;
    stats.livraisons_livrees = livraisons.filter(l => l.statut === 'livree').length;

    // Chiffre d'affaires total
    const { data: commandes } = await supabaseAdmin
      .from('commandes')
      .select('montant_total, statut_paiement');

    const commandesPayees = commandes.filter(c => c.statut_paiement === 'paye');
    stats.chiffre_affaires_total = commandesPayees.reduce((sum, c) => sum + parseFloat(c.montant_total), 0);
    stats.nombre_commandes_payees = commandesPayees.length;

    res.json(stats);
  } catch (error) {
    console.error('Erreur stats:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
});

// Stats agriculteur
app.get('/api/stats/agriculteur', requireAuth, requireRole('agriculteur'), async (req, res) => {
  try {
    const id_agriculteur = req.session.userId;

    // Nombre de produits
    const { count: produitsCount } = await supabaseAdmin
      .from('produits')
      .select('*', { count: 'exact', head: true })
      .eq('id_agriculteur', id_agriculteur);

    // Livraisons
    const { data: livraisons } = await supabaseAdmin
      .from('livraisons')
      .select('*')
      .eq('id_agriculteur', id_agriculteur);

    // Commandes liées aux livraisons de cet agriculteur
    const livraisonIds = livraisons.map(l => l.id);
    const { data: commandes } = await supabaseAdmin
      .from('commandes')
      .select('montant_total, statut_paiement')
      .in('id_livraison', livraisonIds);

    const commandesPayees = commandes.filter(c => c.statut_paiement === 'paye');

    res.json({
      total_produits: produitsCount,
      total_livraisons: livraisons.length,
      livraisons_en_cours: livraisons.filter(l => ['en_attente', 'creneau_valide', 'seuil_atteint'].includes(l.statut)).length,
      livraisons_livrees: livraisons.filter(l => l.statut === 'livree').length,
      chiffre_affaires: commandesPayees.reduce((sum, c) => sum + parseFloat(c.montant_total), 0),
      nombre_commandes: commandesPayees.length
    });
  } catch (error) {
    console.error('Erreur stats agriculteur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
});

// Dans server.js, après les routes existantes

// Liste des utilisateurs (admin uniquement)
app.get('/api/utilisateurs', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('utilisateurs')
      .select(`
        *,
        campus(nom, ville)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
});

// Supprimer un utilisateur (admin uniquement)
app.delete('/api/utilisateurs/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('utilisateurs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    console.error('Erreur suppression utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// Créer un agriculteur (admin uniquement)
app.post('/api/agriculteurs', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { email, mot_de_passe, nom, prenom, telephone, nom_ferme, adresse_ferme, description_ferme } = req.body;

    // Vérifier si l'email existe déjà
    const { data: existingUser } = await supabaseAdmin
      .from('utilisateurs')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(mot_de_passe, 10);

    // Créer l'utilisateur
    const { data, error } = await supabaseAdmin
      .from('utilisateurs')
      .insert({
        email,
        mot_de_passe: hashedPassword,
        nom,
        prenom,
        telephone,
        role: 'agriculteur',
        nom_ferme,
        adresse_ferme,
        description_ferme
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Agriculteur créé avec succès', userId: data.id });
  } catch (error) {
    console.error('Erreur création agriculteur:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'agriculteur' });
  }
});

// ====================================
// ROUTE DE DEBUG - À retirer en production
// ====================================
app.get('/debug/paths', (req, res) => {
  res.json({
    __dirname,
    viewsPath: path.join(__dirname, 'views'),
    publicPath: path.join(__dirname, 'public'),
    cwd: process.cwd()
  });
});

// ====================================
// INITIALISATION & DÉMARRAGE
// ====================================

async function startServer() {
  console.log('🚀 Démarrage de Court Circuit...');

  // Vérifier la connexion à Supabase
  const connected = await checkConnection();
  if (!connected) {
    console.error('❌ Impossible de se connecter à Supabase');
    console.log('Vérifiez vos variables d\'environnement dans .env');
    process.exit(1);
  }

  // Créer l'admin et les campus par défaut
  await createDefaultAdmin(bcrypt);
  await createDefaultCampus();

  // Démarrer le serveur
  app.listen(PORT, () => {
    console.log('');
    console.log('✅ Serveur démarré avec succès !');
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log('');
    console.log('📧 Admin par défaut: admin@court-circuit.fr');
    console.log('🔑 Mot de passe: admin123');
    console.log('⚠️  CHANGEZ CE MOT DE PASSE IMMÉDIATEMENT !');
    console.log('');
  });
}

// Démarrer
startServer().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});

export default app;
