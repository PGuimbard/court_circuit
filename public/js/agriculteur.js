// ====================================
// AGRICULTEUR.JS - Dashboard Agriculteur
// ====================================

let produits = [];
let livraisons = [];
let campusList = [];

// Vérifier l'authentification au chargement
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadCampus();
  await loadStats();
  await loadProduits();
  await loadLivraisons();
  setupEventListeners();
});

// ====================================
// AUTHENTIFICATION
// ====================================

async function checkAuth() {
  try {
    const response = await fetch('/api/auth/check');
    const data = await response.json();
    
    if (!response.ok || data.role !== 'agriculteur') {
      window.location.href = '/login';
      return;
    }
    
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
    window.location.href = '/';
  } catch (error) {
    console.error('Erreur déconnexion:', error);
  }
});

// ====================================
// STATISTIQUES
// ====================================

async function loadStats() {
  try {
    const response = await fetch('/api/stats/agriculteur');
    const stats = await response.json();
    
    document.getElementById('stat-produits').textContent = stats.total_produits || 0;
    document.getElementById('stat-livraisons').textContent = stats.total_livraisons || 0;
    document.getElementById('stat-en-cours').textContent = stats.livraisons_en_cours || 0;
    document.getElementById('stat-commandes').textContent = stats.nombre_commandes || 0;
    document.getElementById('stat-ca').textContent = formatPrice(stats.chiffre_affaires || 0);
  } catch (error) {
    console.error('Erreur chargement stats:', error);
  }
}

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
  
  // Boutons
  document.getElementById('btn-add-produit').addEventListener('click', () => {
    resetProduitForm();
    openModal('modal-produit');
  });
  
  document.getElementById('btn-add-livraison').addEventListener('click', () => {
    document.getElementById('form-livraison').reset();
    openModal('modal-livraison');
  });
  
  // Formulaires
  document.getElementById('form-produit').addEventListener('submit', handleSaveProduit);
  document.getElementById('form-livraison').addEventListener('submit', handleCreateLivraison);
  
  // Preview photo
  document.getElementById('produit-photo').addEventListener('change', previewPhoto);
}

function switchTab(tabName) {
  // Désactiver tous les onglets
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  // Activer l'onglet sélectionné
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  // Charger les données
  switch(tabName) {
    case 'produits':
      loadProduits();
      break;
    case 'livraisons':
      loadLivraisons();
      break;
    case 'commandes':
      loadCommandes();
      break;
  }
}

// ====================================
// CAMPUS
// ====================================

async function loadCampus() {
  try {
    const response = await fetch('/api/campus');
    campusList = await response.json();
    
    // Remplir le select dans le formulaire livraison
    const select = document.getElementById('livraison-campus');
    select.innerHTML = '<option value="">Choisir un campus...</option>' +
      campusList.map(c => `<option value="${c.id}">${c.nom} - ${c.ville}</option>`).join('');
  } catch (error) {
    console.error('Erreur chargement campus:', error);
  }
}

// ====================================
// PRODUITS
// ====================================

async function loadProduits() {
  const grid = document.getElementById('produits-grid');
  
  try {
    const response = await fetch('/api/produits?id_agriculteur=' + (await getCurrentUserId()));
    produits = await response.json();
    
    if (produits.length === 0) {
      grid.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem; grid-column: 1 / -1;">
          <p style="font-size: 3rem;">🌾</p>
          <p>Vous n'avez pas encore de produits</p>
          <button class="btn" onclick="document.getElementById('btn-add-produit').click()">
            Ajouter mon premier produit
          </button>
        </div>
      `;
      return;
    }
    
    grid.innerHTML = produits.map(produit => `
      <div class="card">
        ${produit.photo_url ? 
          `<img src="${produit.photo_url}" alt="${produit.nom}" class="product-image">` :
          `<div style="height: 200px; background: var(--background); display: flex; align-items: center; justify-content: center; border-radius: var(--border-radius); margin-bottom: 1rem;">
            <span style="font-size: 4rem;">🌾</span>
          </div>`
        }
        
        <h3 style="margin-bottom: 0.5rem;">${produit.nom}</h3>
        
        ${produit.categorie ? `<span class="badge badge-info" style="margin-bottom: 0.5rem;">${produit.categorie}</span>` : ''}
        ${produit.disponible ? 
          '<span class="badge badge-success">Disponible</span>' : 
          '<span class="badge badge-secondary">Indisponible</span>'
        }
        
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 1rem 0;">
          ${produit.description || 'Pas de description'}
        </p>
        
        <p style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color); margin-bottom: 1rem;">
          ${formatPrice(produit.prix)} / ${produit.unite}
        </p>
        
        <div class="product-actions">
          <button class="btn btn-small btn-outline" onclick="editProduit('${produit.id}')">
            ✏️ Modifier
          </button>
          <button class="btn btn-small ${produit.disponible ? 'btn-secondary' : ''}" 
                  onclick="toggleDisponibilite('${produit.id}', ${!produit.disponible})">
            ${produit.disponible ? '⏸️ Désactiver' : '▶️ Activer'}
          </button>
          <button class="btn btn-small btn-danger" onclick="deleteProduit('${produit.id}')">
            🗑️
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement produits:', error);
    grid.innerHTML = '<div class="card" style="text-align: center; color: var(--danger);">Erreur de chargement</div>';
  }
}

function resetProduitForm() {
  document.getElementById('form-produit').reset();
  document.getElementById('produit-id').value = '';
  document.getElementById('modal-produit-title').textContent = 'Ajouter un produit';
  document.getElementById('btn-submit-produit').textContent = 'Ajouter le produit';
  document.getElementById('photo-preview').style.display = 'none';
}

function editProduit(produitId) {
  const produit = produits.find(p => p.id === produitId);
  if (!produit) return;
  
  document.getElementById('produit-id').value = produit.id;
  document.getElementById('produit-nom').value = produit.nom;
  document.getElementById('produit-prix').value = produit.prix;
  document.getElementById('produit-unite').value = produit.unite;
  document.getElementById('produit-categorie').value = produit.categorie || '';
  document.getElementById('produit-description').value = produit.description || '';
  
  if (produit.photo_url) {
    document.getElementById('photo-preview').style.display = 'block';
    document.getElementById('photo-preview-img').src = produit.photo_url;
  }
  
  document.getElementById('modal-produit-title').textContent = 'Modifier le produit';
  document.getElementById('btn-submit-produit').textContent = 'Enregistrer les modifications';
  
  openModal('modal-produit');
}

async function handleSaveProduit(e) {
  e.preventDefault();
  
  const produitId = document.getElementById('produit-id').value;
  const formData = new FormData();
  
  formData.append('nom', document.getElementById('produit-nom').value);
  formData.append('prix', document.getElementById('produit-prix').value);
  formData.append('unite', document.getElementById('produit-unite').value);
  formData.append('categorie', document.getElementById('produit-categorie').value);
  formData.append('description', document.getElementById('produit-description').value);
  
  const photoFile = document.getElementById('produit-photo').files[0];
  if (photoFile) {
    formData.append('photo', photoFile);
  }
  
  try {
    const url = produitId ? `/api/produits/${produitId}` : '/api/produits';
    const method = produitId ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    showAlert(produitId ? 'Produit modifié avec succès !' : 'Produit ajouté avec succès !', 'success');
    closeModal('modal-produit');
    loadProduits();
    loadStats();
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message, 'danger');
  }
}

async function toggleDisponibilite(produitId, disponible) {
  try {
    const response = await fetch(`/api/produits/${produitId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible })
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    showAlert(`Produit ${disponible ? 'activé' : 'désactivé'}`, 'success');
    loadProduits();
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message, 'danger');
  }
}

async function deleteProduit(produitId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return;
  
  try {
    const response = await fetch(`/api/produits/${produitId}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    showAlert('Produit supprimé', 'success');
    loadProduits();
    loadStats();
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message, 'danger');
  }
}

function previewPhoto(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('photo-preview').style.display = 'block';
      document.getElementById('photo-preview-img').src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

// ====================================
// LIVRAISONS
// ====================================

async function loadLivraisons() {
  const container = document.getElementById('livraisons-container');
  
  try {
    const userId = await getCurrentUserId();
    const response = await fetch(`/api/livraisons?id_agriculteur=${userId}`);
    livraisons = await response.json();
    
    if (livraisons.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem;">
          <p style="font-size: 3rem;">🚚</p>
          <p>Vous n'avez pas encore créé de livraison</p>
          <button class="btn" onclick="document.getElementById('btn-add-livraison').click()">
            Créer ma première livraison
          </button>
        </div>
      `;
      return;
    }
    
    container.innerHTML = livraisons.map(liv => `
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: between; align-items: start;">
          <div style="flex: 1;">
            <h3 style="color: var(--primary-color); margin-bottom: 0.5rem;">
              ${liv.campus?.nom || 'Campus'}
            </h3>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0;">
              <div>
                <strong>💰 Seuil :</strong> ${formatPrice(liv.seuil_prix)}
              </div>
              <div>
                <strong>📊 Total actuel :</strong> ${formatPrice(liv.total_actuel)}
                <div style="background: var(--background); border-radius: 4px; height: 8px; margin-top: 0.5rem; overflow: hidden;">
                  <div style="background: var(--primary-color); height: 100%; width: ${Math.min((liv.total_actuel / liv.seuil_prix) * 100, 100)}%;"></div>
                </div>
                <small>${Math.round((liv.total_actuel / liv.seuil_prix) * 100)}%</small>
              </div>
            </div>
            
            <div style="background: var(--background); padding: 1rem; border-radius: var(--border-radius); margin: 1rem 0;">
              <strong>📅 Créneaux proposés :</strong>
              <div style="margin-top: 0.5rem;">
                ${liv.creneau_valide ? 
                  `<p style="color: var(--success); font-weight: bold;">
                    ✅ Validé : ${formatDate(liv.date_livraison)}
                  </p>` :
                  `
                    <p>1️⃣ ${formatDate(liv.creneau_1)}</p>
                    <p>2️⃣ ${formatDate(liv.creneau_2)}</p>
                    <p>3️⃣ ${formatDate(liv.creneau_3)}</p>
                    <small style="color: var(--text-secondary);">En attente de validation par l'admin</small>
                  `
                }
              </div>
            </div>
            
            <div>
              ${getStatusBadge(liv.statut)}
              <small style="color: var(--text-secondary); margin-left: 1rem;">
                Date limite commandes : ${formatDate(liv.date_limite_commande)}
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

async function handleCreateLivraison(e) {
  e.preventDefault();
  
  const formData = {
    id_campus: document.getElementById('livraison-campus').value,
    seuil_prix: document.getElementById('livraison-seuil').value,
    creneau_1: document.getElementById('livraison-creneau1').value,
    creneau_2: document.getElementById('livraison-creneau2').value,
    creneau_3: document.getElementById('livraison-creneau3').value
  };
  
  try {
    const response = await fetch('/api/livraisons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    showAlert('Livraison créée avec succès ! En attente de validation par l\'admin.', 'success');
    closeModal('modal-livraison');
    loadLivraisons();
    loadStats();
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message, 'danger');
  }
}

// ====================================
// COMMANDES
// ====================================

async function loadCommandes() {
  const tbody = document.getElementById('commandes-tbody');
  
  try {
    const response = await fetch('/api/mes-commandes');
    const commandes = await response.json();
    
    if (commandes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">Aucune commande reçue</td></tr>';
      return;
    }
    
    tbody.innerHTML = commandes.map(cmd => `
      <tr>
        <td>${formatDate(cmd.created_at)}</td>
        <td>
          <strong>${cmd.etudiant?.nom} ${cmd.etudiant?.prenom}</strong><br>
          <small>${cmd.etudiant?.email}</small>
        </td>
        <td>${cmd.livraison?.campus?.nom || 'N/A'}</td>
        <td><strong>${formatPrice(cmd.montant_total)}</strong></td>
        <td>${getPaymentBadge(cmd.statut_paiement)}</td>
        <td>
          <button class="btn btn-small btn-outline" onclick="alert('Détails à venir')">Voir</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement commandes:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Erreur de chargement</td></tr>';
  }
}

// ====================================
// FONCTIONS UTILITAIRES
// ====================================

async function getCurrentUserId() {
  const response = await fetch('/api/auth/check');
  const data = await response.json();
  return data.userId;
}

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
    'en_attente': '<span class="badge badge-warning">En attente</span>',
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

// Style pour les onglets
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
  
  .product-image {
    width: 100%;
    height: 200px;
    object-fit: cover;
    border-radius: var(--border-radius);
    margin-bottom: 1rem;
  }
  
  .product-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
`;
document.head.appendChild(style);
