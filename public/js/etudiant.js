// ====================================
// ETUDIANT.JS - Interface Étudiant
// ====================================

let panier = [];
let produits = [];
let livraisons = [];
let userInfo = null;

// Vérifier l'authentification au chargement
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadProduits();
  await loadLivraisons();
  await loadCommandes();
  setupEventListeners();
  loadPanierFromStorage();
});

// ====================================
// AUTHENTIFICATION
// ====================================

async function checkAuth() {
  try {
    const response = await fetch('/api/auth/check');
    const data = await response.json();
    
    if (!response.ok || data.role !== 'etudiant') {
      window.location.href = '/login';
      return;
    }
    
    userInfo = data;
    document.getElementById('user-name').textContent = `${data.prenom} ${data.nom}`;
  } catch (error) {
    console.error('Erreur auth:', error);
    window.location.href = '/login';
  }
}

// Déconnexion
document.getElementById('logout-btn').addEventListener('click', async (e) => {
  e.preventDefault();
  
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('panier');
    window.location.href = '/';
  } catch (error) {
    console.error('Erreur déconnexion:', error);
  }
});

// ====================================
// GESTION DES ONGLETS
// ====================================

function setupEventListeners() {
  // Onglets
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });
  
  // Filtres
  document.getElementById('filter-categorie').addEventListener('change', () => {
    afficherProduits();
  });
}

function switchTab(tabName) {
  // Désactiver tous les onglets
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  // Activer l'onglet sélectionné
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  // Charger les données si nécessaire
  if (tabName === 'panier') {
    afficherPanier();
  }
}

// ====================================
// CATALOGUE DE PRODUITS
// ====================================

async function loadProduits() {
  const grid = document.getElementById('produits-grid');
  
  try {
    const response = await fetch('/api/produits');
    produits = await response.json();
    
    afficherProduits();
  } catch (error) {
    console.error('Erreur chargement produits:', error);
    grid.innerHTML = '<div class="card" style="text-align: center; color: var(--danger);">Erreur de chargement</div>';
  }
}

function afficherProduits() {
  const grid = document.getElementById('produits-grid');
  const categorieFilter = document.getElementById('filter-categorie').value;
  
  let produitsFiltres = produits;
  if (categorieFilter) {
    produitsFiltres = produits.filter(p => p.categorie === categorieFilter);
  }
  
  if (produitsFiltres.length === 0) {
    grid.innerHTML = '<div class="card" style="text-align: center; padding: 3rem;">Aucun produit trouvé</div>';
    return;
  }
  
  grid.innerHTML = produitsFiltres.map(produit => `
    <div class="card product-card">
      ${produit.photo_url ? 
        `<img src="${produit.photo_url}" alt="${produit.nom}" class="product-image">` :
        `<div style="height: 200px; background: var(--background); display: flex; align-items: center; justify-content: center; border-radius: var(--border-radius); margin-bottom: 1rem;">
          <span style="font-size: 4rem;">🌾</span>
        </div>`
      }
      
      <h3 style="margin-bottom: 0.5rem;">${produit.nom}</h3>
      
      ${produit.categorie ? `<span class="badge badge-info" style="margin-bottom: 0.5rem;">${produit.categorie}</span>` : ''}
      
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
        ${produit.description || 'Produit local et de qualité'}
      </p>
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div>
          <p style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color); margin: 0;">
            ${formatPrice(produit.prix)}
          </p>
          <small style="color: var(--text-secondary);">/ ${produit.unite}</small>
        </div>
      </div>
      
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <input 
          type="number" 
          min="0.5" 
          step="0.5" 
          value="1" 
          id="qty-${produit.id}"
          style="width: 80px; padding: 0.5rem;"
          placeholder="Qté"
        >
        <button class="btn btn-block" onclick="ajouterAuPanier('${produit.id}')">
          Ajouter au panier
        </button>
      </div>
      
      <div style="margin-top: 0.5rem;">
        <small style="color: var(--text-secondary);">
          <strong>${produit.agriculteur?.nom_ferme || 'Ferme locale'}</strong>
        </small>
      </div>
    </div>
  `).join('');
}

// ====================================
// GESTION DU PANIER
// ====================================

function ajouterAuPanier(produitId) {
  const produit = produits.find(p => p.id === produitId);
  if (!produit) return;
  
  const qtyInput = document.getElementById(`qty-${produitId}`);
  const quantite = parseFloat(qtyInput.value) || 1;
  
  if (quantite <= 0) {
    showAlert('La quantité doit être supérieure à 0', 'warning');
    return;
  }
  
  // Vérifier si le produit est déjà dans le panier
  const existingIndex = panier.findIndex(item => item.id === produitId);
  
  if (existingIndex !== -1) {
    panier[existingIndex].quantite += quantite;
  } else {
    panier.push({
      id: produit.id,
      nom: produit.nom,
      prix: produit.prix,
      unite: produit.unite,
      photo_url: produit.photo_url,
      quantite: quantite,
      agriculteur: produit.agriculteur
    });
  }
  
  savePanierToStorage();
  updatePanierBadge();
  showAlert(`${produit.nom} ajouté au panier !`, 'success');
  
  // Réinitialiser la quantité
  qtyInput.value = 1;
}

function retirerDuPanier(produitId) {
  panier = panier.filter(item => item.id !== produitId);
  savePanierToStorage();
  updatePanierBadge();
  afficherPanier();
}

function modifierQuantite(produitId, nouvelleQuantite) {
  const item = panier.find(item => item.id === produitId);
  if (item) {
    item.quantite = parseFloat(nouvelleQuantite);
    if (item.quantite <= 0) {
      retirerDuPanier(produitId);
    } else {
      savePanierToStorage();
      afficherPanier();
    }
  }
}

function afficherPanier() {
  const container = document.getElementById('panier-container');
  const totalDiv = document.getElementById('panier-total');
  
  if (panier.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem;">
        <p style="font-size: 3rem;">🛒</p>
        <p>Votre panier est vide</p>
        <button class="btn" onclick="switchTab('catalogue')">Découvrir les produits</button>
      </div>
    `;
    totalDiv.style.display = 'none';
    return;
  }
  
  const total = panier.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
  
  container.innerHTML = `
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Produit</th>
            <th>Prix unitaire</th>
            <th>Quantité</th>
            <th>Sous-total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${panier.map(item => `
            <tr>
              <td>
                <div style="display: flex; align-items: center; gap: 1rem;">
                  ${item.photo_url ? 
                    `<img src="${item.photo_url}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;">` :
                    `<div style="width: 50px; height: 50px; background: var(--background); display: flex; align-items: center; justify-content: center; border-radius: 8px;">🌾</div>`
                  }
                  <div>
                    <strong>${item.nom}</strong><br>
                    <small>${item.agriculteur?.nom_ferme || 'Ferme locale'}</small>
                  </div>
                </div>
              </td>
              <td>${formatPrice(item.prix)} / ${item.unite}</td>
              <td>
                <input 
                  type="number" 
                  min="0.5" 
                  step="0.5" 
                  value="${item.quantite}"
                  onchange="modifierQuantite('${item.id}', this.value)"
                  style="width: 80px;"
                >
              </td>
              <td><strong>${formatPrice(item.prix * item.quantite)}</strong></td>
              <td>
                <button class="btn btn-small btn-danger" onclick="retirerDuPanier('${item.id}')">
                  Retirer
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  totalDiv.style.display = 'block';
  document.getElementById('total-prix').textContent = formatPrice(total);
}

function updatePanierBadge() {
  const count = panier.length;
  const badge = document.getElementById('panier-badge');
  const tabBadge = document.getElementById('panier-count');
  
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
    tabBadge.textContent = count;
    tabBadge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
    tabBadge.style.display = 'none';
  }
}

function savePanierToStorage() {
  localStorage.setItem('panier', JSON.stringify(panier));
}

function loadPanierFromStorage() {
  const saved = localStorage.getItem('panier');
  if (saved) {
    panier = JSON.parse(saved);
    updatePanierBadge();
  }
}

// ====================================
// LIVRAISONS
// ====================================

async function loadLivraisons() {
  const container = document.getElementById('livraisons-container');
  
  try {
    // Charger les livraisons du campus de l'étudiant
    const response = await fetch(`/api/livraisons?id_campus=${userInfo.id_campus}`);
    livraisons = await response.json();
    
    // Filtrer les livraisons disponibles pour commande
    const livraisonsDisponibles = livraisons.filter(liv => 
      ['en_attente', 'creneau_valide', 'seuil_atteint'].includes(liv.statut) &&
      new Date(liv.date_limite_commande) > new Date()
    );
    
    if (livraisonsDisponibles.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem;">
          <p style="font-size: 3rem;">📭</p>
          <p>Aucune livraison programmée pour votre campus actuellement</p>
          <small style="color: var(--text-secondary);">Revenez bientôt !</small>
        </div>
      `;
      return;
    }
    
    container.innerHTML = livraisonsDisponibles.map(liv => `
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <h3 style="color: var(--primary-color); margin-bottom: 0.5rem;">
              ${liv.agriculteur?.nom_ferme || 'Ferme locale'}
            </h3>
            <p style="color: var(--text-secondary); margin-bottom: 1rem;">
              ${liv.agriculteur?.nom} ${liv.agriculteur?.prenom}
            </p>
            
            <div style="display: flex; gap: 2rem; margin-bottom: 1rem;">
              <div>
                <strong>📅 Livraison :</strong><br>
                ${liv.creneau_valide ? 
                  formatDate(liv.date_livraison) :
                  `<small>Créneau à confirmer</small>`
                }
              </div>
              <div>
                <strong>📍 Campus :</strong><br>
                ${liv.campus?.nom}
              </div>
            </div>
            
            <div style="margin-bottom: 1rem;">
              <strong>💰 Progression :</strong>
              <div style="background: var(--background); border-radius: 8px; padding: 0.5rem; margin-top: 0.5rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                  <span>${formatPrice(liv.total_actuel)}</span>
                  <span>${formatPrice(liv.seuil_prix)}</span>
                </div>
                <div style="background: var(--border); height: 10px; border-radius: 5px; overflow: hidden;">
                  <div style="background: var(--primary-color); height: 100%; width: ${Math.min((liv.total_actuel / liv.seuil_prix) * 100, 100)}%;"></div>
                </div>
                <small style="color: var(--text-secondary);">
                  ${Math.round((liv.total_actuel / liv.seuil_prix) * 100)}% du seuil atteint
                </small>
              </div>
            </div>
            
            <div>
              ${getStatusBadge(liv.statut)}
              <small style="color: var(--text-secondary); margin-left: 1rem;">
                Date limite : ${formatDate(liv.date_limite_commande)}
              </small>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement livraisons:', error);
    container.innerHTML = '<div class="card" style="text-align: center; color: var(--danger);">Erreur de chargement</div>';
  }
}

// ====================================
// COMMANDE
// ====================================

async function procederCommande() {
  if (panier.length === 0) {
    showAlert('Votre panier est vide', 'warning');
    return;
  }
  
  // Charger les livraisons disponibles pour le campus de l'étudiant
  const livraisonsDisponibles = livraisons.filter(liv => 
    ['en_attente', 'creneau_valide', 'seuil_atteint'].includes(liv.statut) &&
    new Date(liv.date_limite_commande) > new Date()
  );
  
  if (livraisonsDisponibles.length === 0) {
    showAlert('Aucune livraison disponible pour votre campus', 'danger');
    return;
  }
  
  // Remplir le select des livraisons
  const select = document.getElementById('commande-livraison');
  select.innerHTML = '<option value="">Choisir une livraison...</option>' +
    livraisonsDisponibles.map(liv => `
      <option value="${liv.id}">
        ${liv.agriculteur?.nom_ferme} - ${liv.creneau_valide ? formatDate(liv.date_livraison) : 'Date à confirmer'}
      </option>
    `).join('');
  
  // Afficher le récapitulatif
  const total = panier.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
  
  document.getElementById('recapitulatif-produits').innerHTML = `
    <div style="background: var(--background); padding: 1rem; border-radius: var(--border-radius);">
      ${panier.map(item => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <span>${item.nom} (${item.quantite} ${item.unite})</span>
          <strong>${formatPrice(item.prix * item.quantite)}</strong>
        </div>
      `).join('')}
    </div>
  `;
  
  document.getElementById('modal-total').textContent = formatPrice(total);
  
  openModal('modal-commande');
}

async function validerCommande() {
  const livraisonId = document.getElementById('commande-livraison').value;
  
  if (!livraisonId) {
    showAlert('Veuillez choisir une livraison', 'warning');
    return;
  }
  
  try {
    // Préparer les produits
    const produits = panier.map(item => ({
      id_produit: item.id,
      quantite: item.quantite
    }));
    
    const response = await fetch('/api/commandes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_livraison: livraisonId,
        produits: produits
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    // Vérifier si on est en mode dev
    const isDev = true; // À récupérer depuis une variable d'environnement côté client
    
    if (isDev) {
      // Mode développement : simuler le paiement
      if (confirm('Mode développement : Simuler le paiement maintenant ?')) {
        await simulerPaiement(data.commande.id);
      }
    } else {
      // Mode production : rediriger vers HelloAsso
      // TODO: Implémenter la redirection HelloAsso
      showAlert('Redirection vers le paiement...', 'info');
    }
    
    // Vider le panier
    panier = [];
    savePanierToStorage();
    updatePanierBadge();
    
    closeModal('modal-commande');
    switchTab('commandes');
    loadCommandes();
    
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message, 'danger');
  }
}

async function simulerPaiement(commandeId) {
  try {
    const response = await fetch(`/api/commandes/${commandeId}/simuler-paiement`, {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    showAlert('Paiement simulé avec succès ! Commande confirmée.', 'success');
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message, 'danger');
  }
}

// ====================================
// MES COMMANDES
// ====================================

async function loadCommandes() {
  const container = document.getElementById('commandes-container');
  
  try {
    const response = await fetch('/api/mes-commandes');
    const commandes = await response.json();
    
    if (commandes.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem;">
          <p style="font-size: 3rem;">📦</p>
          <p>Vous n'avez pas encore passé de commande</p>
          <button class="btn" onclick="switchTab('catalogue')">Découvrir les produits</button>
        </div>
      `;
      return;
    }
    
    container.innerHTML = commandes.map(cmd => `
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
          <div>
            <h3 style="margin-bottom: 0.5rem;">Commande du ${formatDate(cmd.created_at)}</h3>
            <p style="color: var(--text-secondary); margin: 0;">
              ${cmd.livraison?.agriculteur?.nom_ferme || 'N/A'} - 
              ${cmd.livraison?.campus?.nom || 'N/A'}
            </p>
          </div>
          <div style="text-align: right;">
            <p style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color); margin: 0;">
              ${formatPrice(cmd.montant_total)}
            </p>
            ${getPaymentBadge(cmd.statut_paiement)}
          </div>
        </div>
        
        <div style="background: var(--background); padding: 1rem; border-radius: var(--border-radius); margin-bottom: 1rem;">
          <strong>📦 Produits commandés :</strong>
          ${cmd.lignes_commande?.map(ligne => `
            <div style="display: flex; justify-content: space-between; margin-top: 0.5rem;">
              <span>${ligne.produit?.nom} (${ligne.quantite} ${ligne.produit?.unite})</span>
              <strong>${formatPrice(ligne.sous_total)}</strong>
            </div>
          `).join('') || '<p>Détails indisponibles</p>'}
        </div>
        
        ${cmd.livraison?.date_livraison ? `
          <p><strong>📅 Livraison prévue :</strong> ${formatDate(cmd.livraison.date_livraison)}</p>
        ` : ''}
        
        ${getStatusBadge(cmd.livraison?.statut || 'en_attente')}
      </div>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement commandes:', error);
    container.innerHTML = '<div class="card" style="text-align: center; color: var(--danger);">Erreur de chargement</div>';
  }
}

// ====================================
// FONCTIONS UTILITAIRES
// ====================================

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatPrice(amount) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
}

function getStatusBadge(statut) {
  const badges = {
    'en_attente': '<span class="badge badge-warning">En attente</span>',
    'creneau_valide': '<span class="badge badge-info">Créneau validé</span>',
    'seuil_atteint': '<span class="badge badge-success">Seuil atteint</span>',
    'confirmee': '<span class="badge badge-success">Confirmée</span>',
    'livree': '<span class="badge">Livrée</span>',
    'annulee': '<span class="badge badge-danger">Annulée</span>'
  };
  return badges[statut] || statut;
}

function getPaymentBadge(statut) {
  const badges = {
    'en_attente': '<span class="badge badge-warning">Paiement en attente</span>',
    'paye': '<span class="badge badge-success">Payé</span>',
    'rembourse': '<span class="badge badge-danger">Remboursé</span>',
    'annule': '<span class="badge badge-danger">Annulé</span>'
  };
  return badges[statut] || statut;
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alert-container');
  alertContainer.innerHTML = `
    <div class="alert alert-${type}">
      ${message}
    </div>
  `;
  
  setTimeout(() => {
    alertContainer.innerHTML = '';
  }, 5000);
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Style pour les onglets (si pas déjà dans le CSS)
const style = document.createElement('style');
style.textContent = `
  .tab-btn {
    background: none;
    border: none;
    padding: 1rem 1.5rem;
    font-size: 1rem;
    cursor: pointer;
    color: var(--text-secondary);
    border-bottom: 3px solid transparent;
    transition: all 0.3s ease;
  }
  
  .tab-btn:hover {
    color: var(--primary-color);
  }
  
  .tab-btn.active {
    color: var(--primary-color);
    border-bottom-color: var(--primary-color);
    font-weight: 600;
  }
  
  .tab-content {
    display: none;
  }
  
  .tab-content.active {
    display: block;
  }
  
  .grid-produits {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
  }
  
  .product-card {
    transition: all 0.3s ease;
  }
  
  .product-card:hover {
    transform: translateY(-5px);
    box-shadow: var(--shadow-lg);
  }
  
  .product-image {
    width: 100%;
    height: 200px;
    object-fit: cover;
    border-radius: var(--border-radius);
    margin-bottom: 1rem;
  }
`;
document.head.appendChild(style);
