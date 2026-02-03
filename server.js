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

// Middleware
//app.use(express.json());
//app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json()); // ✅ for JSON bodies (fetch, API)
app.use(express.urlencoded({ extended: true })); // ✅ for HTML forms


// Configuration des sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret-par-defaut-a-changer',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS en production
    maxAge: 24 * 60 * 60 * 1000 // 24 heures
  }
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
// ROUTES PAGES HTML
// ====================================

app.get('/', (req, res) => {
  res.sendFile(new URL('./views/index.html', import.meta.url));
  //res.sendFile(path.join(__dirname,'views',  'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(new URL('./views/login.html', import.meta.url));
  //res.sendFile(path.join(__dirname,'views', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(new URL('./views/register.html', import.meta.url));
  //res.sendFile(path.join(__dirname,'views', 'register.html'));
});

app.get('/admin', requireAuth, requireRole('admin'), (req, res) => {
  //res.sendFile(path.join(__dirname,'views', 'admin.html'));
  res.sendFile(new URL('./views/admin.html', import.meta.url));
});

app.get('/agriculteur', requireAuth, requireRole('agriculteur'), (req, res) => {
  //res.sendFile(path.join(__dirname,'views', 'agriculteur.html'));
  res.sendFile(new URL('./views/agriculteur.html', import.meta.url));
});

app.get('/etudiant', requireAuth, requireRole('etudiant'), (req, res) => {
  //res.sendFile(path.join(__dirname,'views', 'etudiant.html'));
  res.sendFile(new URL('./views/etudiant.html', import.meta.url));
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

// Créer un produit (agriculteur uniquement)
app.post('/api/produits', requireAuth, requireRole('agriculteur'), upload.single('photo'), async (req, res) => {
  try {
    const { nom, description, prix, unite, categorie } = req.body;
    const id_agriculteur = req.session.userId;

    // Validation
    if (!nom || !prix || !unite) {
      return res.status(400).json({ error: 'Nom, prix et unité sont requis' });
    }

    let photo_url = null;
    let photo_public_id = null;

    // Upload de la photo sur Cloudinary
    if (req.file) {
      const result = await uploadImage(req.file.buffer, 'produits');
      photo_url = result.url;
      photo_public_id = result.public_id;
    }

    // Créer le produit
    const { data, error } = await supabaseAdmin
      .from('produits')
      .insert({
        id_agriculteur,
        nom,
        description,
        prix: parseFloat(prix),
        unite,
        categorie,
        photo_url,
        photo_public_id,
        disponible: true
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Produit créé avec succès', produit: data });
  } catch (error) {
    console.error('Erreur création produit:', error);
    res.status(500).json({ error: 'Erreur lors de la création du produit' });
  }
});

// Mettre à jour un produit
app.put('/api/produits/:id', requireAuth, requireRole('agriculteur'), upload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, description, prix, unite, categorie, disponible } = req.body;
    const id_agriculteur = req.session.userId;

    // Vérifier que le produit appartient à l'agriculteur
    const { data: produit } = await supabaseAdmin
      .from('produits')
      .select('*')
      .eq('id', id)
      .eq('id_agriculteur', id_agriculteur)
      .single();

    if (!produit) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    const updateData = {
      nom: nom || produit.nom,
      description: description || produit.description,
      prix: prix ? parseFloat(prix) : produit.prix,
      unite: unite || produit.unite,
      categorie: categorie || produit.categorie,
      disponible: disponible !== undefined ? disponible : produit.disponible
    };

    // Nouvelle photo ?
    if (req.file) {
      // Supprimer l'ancienne photo
      if (produit.photo_public_id) {
        await deleteImage(produit.photo_public_id);
      }
      
      // Upload la nouvelle
      const result = await uploadImage(req.file.buffer, 'produits');
      updateData.photo_url = result.url;
      updateData.photo_public_id = result.public_id;
    }

    // Mettre à jour
    const { data, error } = await supabaseAdmin
      .from('produits')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Produit mis à jour', produit: data });
  } catch (error) {
    console.error('Erreur mise à jour produit:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du produit' });
  }
});

// Supprimer un produit
app.delete('/api/produits/:id', requireAuth, requireRole('agriculteur'), async (req, res) => {
  try {
    const { id } = req.params;
    const id_agriculteur = req.session.userId;

    // Récupérer le produit
    const { data: produit } = await supabaseAdmin
      .from('produits')
      .select('*')
      .eq('id', id)
      .eq('id_agriculteur', id_agriculteur)
      .single();

    if (!produit) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    // Supprimer la photo de Cloudinary
    if (produit.photo_public_id) {
      await deleteImage(produit.photo_public_id);
    }

    // Supprimer le produit
    const { error } = await supabaseAdmin
      .from('produits')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Produit supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression produit:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du produit' });
  }
});

// ====================================
// ROUTES API - LIVRAISONS
// ====================================

// Liste des livraisons (filtrable par statut, campus, agriculteur)
app.get('/api/livraisons', requireAuth, async (req, res) => {
  try {
    const { statut, id_campus, id_agriculteur } = req.query;

    let query = supabaseAdmin
      .from('livraisons')
      .select(`
        *,
        agriculteur:utilisateurs!id_agriculteur(nom, prenom, nom_ferme),
        campus(nom, ville)
      `)
      .order('created_at', { ascending: false });

    // Filtres
    if (statut) query = query.eq('statut', statut);
    if (id_campus) query = query.eq('id_campus', id_campus);
    if (id_agriculteur) query = query.eq('id_agriculteur', id_agriculteur);

    const { data, error } = await query;

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur récupération livraisons:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des livraisons' });
  }
});

// Détails d'une livraison avec ses commandes
app.get('/api/livraisons/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Récupérer la livraison
    const { data: livraison, error: livraisonError } = await supabaseAdmin
      .from('livraisons')
      .select(`
        *,
        agriculteur:utilisateurs!id_agriculteur(nom, prenom, nom_ferme, telephone),
        campus(nom, ville, adresse)
      `)
      .eq('id', id)
      .single();

    if (livraisonError) throw livraisonError;

    // Récupérer les commandes associées
    const { data: commandes, error: commandesError } = await supabaseAdmin
      .from('commandes')
      .select(`
        *,
        etudiant:utilisateurs!id_etudiant(nom, prenom, email, telephone),
        lignes_commande(
          *,
          produit:produits(nom, prix, unite)
        )
      `)
      .eq('id_livraison', id);

    if (commandesError) throw commandesError;

    res.json({
      ...livraison,
      commandes
    });
  } catch (error) {
    console.error('Erreur détails livraison:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des détails' });
  }
});

// Créer une livraison (agriculteur uniquement)
app.post('/api/livraisons', requireAuth, requireRole('agriculteur'), async (req, res) => {
  try {
    const { id_campus, seuil_prix, creneau_1, creneau_2, creneau_3 } = req.body;
    const id_agriculteur = req.session.userId;

    // Validation
    if (!id_campus || !seuil_prix || !creneau_1 || !creneau_2 || !creneau_3) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    // Vérifier que les 3 créneaux sont différents
    const creneaux = [new Date(creneau_1), new Date(creneau_2), new Date(creneau_3)];
    const uniqueCreneaux = new Set(creneaux.map(d => d.getTime()));
    if (uniqueCreneaux.size !== 3) {
      return res.status(400).json({ error: 'Les 3 créneaux doivent être différents' });
    }

    // Calculer la date limite de commande (10 jours avant le premier créneau)
    const premierCreneau = new Date(Math.min(...creneaux.map(d => d.getTime())));
    const dateLimite = new Date(premierCreneau);
    dateLimite.setDate(dateLimite.getDate() - 10);

    // Créer la livraison
    const { data, error } = await supabaseAdmin
      .from('livraisons')
      .insert({
        id_agriculteur,
        id_campus,
        seuil_prix: parseFloat(seuil_prix),
        creneau_1,
        creneau_2,
        creneau_3,
        date_limite_commande: dateLimite.toISOString(),
        statut: 'en_attente',
        total_actuel: 0
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Livraison créée avec succès', livraison: data });
  } catch (error) {
    console.error('Erreur création livraison:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la livraison' });
  }
});

// Valider un créneau (admin uniquement)
app.put('/api/livraisons/:id/valider-creneau', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { creneau_numero } = req.body; // 1, 2 ou 3

    if (![1, 2, 3].includes(creneau_numero)) {
      return res.status(400).json({ error: 'Le créneau doit être 1, 2 ou 3' });
    }

    // Récupérer la livraison
    const { data: livraison } = await supabaseAdmin
      .from('livraisons')
      .select('*')
      .eq('id', id)
      .single();

    if (!livraison) {
      return res.status(404).json({ error: 'Livraison non trouvée' });
    }

    // Récupérer la date du créneau sélectionné
    const creneauKey = `creneau_${creneau_numero}`;
    const dateValidee = livraison[creneauKey];

    // Mettre à jour
    const { data, error } = await supabaseAdmin
      .from('livraisons')
      .update({
        creneau_valide: creneau_numero,
        date_livraison: dateValidee,
        statut: 'creneau_valide'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Créneau validé avec succès', livraison: data });
  } catch (error) {
    console.error('Erreur validation créneau:', error);
    res.status(500).json({ error: 'Erreur lors de la validation du créneau' });
  }
});

// Confirmer une livraison (admin - si seuil atteint)
app.put('/api/livraisons/:id/confirmer', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Récupérer la livraison
    const { data: livraison } = await supabaseAdmin
      .from('livraisons')
      .select('*')
      .eq('id', id)
      .single();

    if (!livraison) {
      return res.status(404).json({ error: 'Livraison non trouvée' });
    }

    // Vérifier que le seuil est atteint
    if (livraison.total_actuel < livraison.seuil_prix) {
      return res.status(400).json({ 
        error: 'Le seuil de prix n\'est pas encore atteint',
        total_actuel: livraison.total_actuel,
        seuil_prix: livraison.seuil_prix
      });
    }

    // Confirmer
    const { data, error } = await supabaseAdmin
      .from('livraisons')
      .update({ statut: 'confirmee' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Livraison confirmée', livraison: data });
  } catch (error) {
    console.error('Erreur confirmation livraison:', error);
    res.status(500).json({ error: 'Erreur lors de la confirmation' });
  }
});

// Marquer comme livrée (admin ou agriculteur)
app.put('/api/livraisons/:id/livree', requireAuth, requireRole('admin', 'agriculteur'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('livraisons')
      .update({ statut: 'livree' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Livraison marquée comme effectuée', livraison: data });
  } catch (error) {
    console.error('Erreur marquage livraison:', error);
    res.status(500).json({ error: 'Erreur lors du marquage' });
  }
});

// ====================================
// ROUTES API - COMMANDES
// ====================================

// Créer une commande (étudiant uniquement)
app.post('/api/commandes', requireAuth, requireRole('etudiant'), async (req, res) => {
  try {
    const { id_livraison, produits } = req.body; // produits = [{id_produit, quantite}, ...]
    const id_etudiant = req.session.userId;

    // Validation
    if (!id_livraison || !produits || produits.length === 0) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    // Vérifier que la livraison existe et accepte encore les commandes
    const { data: livraison } = await supabaseAdmin
      .from('livraisons')
      .select('*')
      .eq('id', id_livraison)
      .single();

    if (!livraison) {
      return res.status(404).json({ error: 'Livraison non trouvée' });
    }

    if (new Date() > new Date(livraison.date_limite_commande)) {
      return res.status(400).json({ error: 'La date limite de commande est dépassée' });
    }

    if (!['en_attente', 'creneau_valide', 'seuil_atteint'].includes(livraison.statut)) {
      return res.status(400).json({ error: 'Cette livraison n\'accepte plus de commandes' });
    }

    // Calculer le montant total et récupérer les infos produits
    let montant_total = 0;
    const lignes = [];

    for (const item of produits) {
      const { data: produit } = await supabaseAdmin
        .from('produits')
        .select('*')
        .eq('id', item.id_produit)
        .single();

      if (!produit) {
        return res.status(404).json({ error: `Produit ${item.id_produit} non trouvé` });
      }

      const sous_total = produit.prix * item.quantite;
      montant_total += sous_total;

      lignes.push({
        id_produit: produit.id,
        quantite: item.quantite,
        prix_unitaire: produit.prix,
        sous_total
      });
    }

    // Créer la commande
    const { data: commande, error: commandeError } = await supabaseAdmin
      .from('commandes')
      .insert({
        id_etudiant,
        id_livraison,
        montant_total,
        statut_paiement: 'en_attente'
      })
      .select()
      .single();

    if (commandeError) throw commandeError;

    // Créer les lignes de commande
    const lignesAvecIdCommande = lignes.map(ligne => ({
      ...ligne,
      id_commande: commande.id
    }));

    const { error: lignesError } = await supabaseAdmin
      .from('lignes_commande')
      .insert(lignesAvecIdCommande);

    if (lignesError) throw lignesError;

    // Mettre à jour le total de la livraison
    const { error: updateError } = await supabaseAdmin
      .from('livraisons')
      .update({
        total_actuel: livraison.total_actuel + montant_total,
        statut: (livraison.total_actuel + montant_total) >= livraison.seuil_prix 
          ? 'seuil_atteint' 
          : livraison.statut
      })
      .eq('id', id_livraison);

    if (updateError) throw updateError;

    res.json({
      message: 'Commande créée avec succès',
      commande: {
        ...commande,
        lignes: lignesAvecIdCommande
      }
    });
  } catch (error) {
    console.error('Erreur création commande:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la commande' });
  }
});

// Liste des commandes de l'utilisateur connecté
app.get('/api/mes-commandes', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const role = req.session.role;

    let query = supabaseAdmin
      .from('commandes')
      .select(`
        *,
        livraison:livraisons(
          *,
          campus(nom, ville),
          agriculteur:utilisateurs!id_agriculteur(nom, prenom, nom_ferme)
        ),
        lignes_commande(
          *,
          produit:produits(nom, prix, unite, photo_url)
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
