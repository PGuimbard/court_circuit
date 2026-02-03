// ====================================
// ADMIN.JS - Dashboard Administrateur
// ====================================

// Vérifier l'authentification au chargement
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadStats();
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
    
    if (!response.ok || data.role !== 'admin') {
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
    const response = await fetch('/api/stats');
    const stats = await response.json();
    
    document.getElementById('stat-users').textContent = stats.total_utilisateurs || 0;
    document.getElementById('stat-etudiants').textContent = stats.total_etudiants || 0;
    document.getElementById('stat-agriculteurs').textContent = stats.total_agriculteurs || 0;
    document.getElementById('stat-produits').textContent = stats.total_produits || 0;
    document.getElementById('stat-livraisons').textContent = 
      (stats.livraisons_en_attente || 0) + (stats.livraisons_confirmees || 0) + (stats.livraisons_livrees || 0);
    document.getElementById('stat-confirmees').textContent = stats.livraisons_confirmees || 0;
    document.getElementById('stat-livrees').textContent = stats.livraisons_livrees || 0;
    document.getElementById('stat-ca').textContent = formatPrice(stats.chiffre_affaires_total || 0);
    document.getElementById('stat-commandes').textContent = stats.nombre_commandes_payees || 0;
  } catch (error) {
    console.error('Erreur chargement stats:', error);
    showAlert('Erreur lors du chargement des statistiques', 'danger');
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
  
  // Filtres
  document.getElementById('filter-statut').addEventListener('change', () => {
    loadLivraisons();
  });
  
  // Boutons
  document.getElementById('btn-add-agriculteur').addEventListener('click', () => {
    openModal('modal-agriculteur');
  });
  
  // Formulaire agriculteur
  document.getElementById('form-agriculteur').addEventListener('submit', handleAddAgriculteur);
}

function switchTab(tabName) {
  // Désactiver tous les onglets
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  // Activer l'onglet sélectionné
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  // Charger les données de l'onglet
  switch(tabName) {
    case 'livraisons':
      loadLivraisons();
      break;
    case 'utilisateurs':
      loadUtilisateurs();
      break;
    case 'commandes':
      loadCommandes();
      break;
  }
}

// ====================================
// LIVRAISONS
// ====================================

async function loadLivraisons() {
  const tbody = document.getElementById('livraisons-tbody');
  const statut = document.getElementById('filter-statut').value;
  
  try {
    let url = '/api/livraisons';
    if (statut) url += `?statut=${statut}`;
    
    const response = await fetch(url);
    const livraisons = await response.json();
    
    if (livraisons.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Aucune livraison trouvée</td></tr>';
      return;
    }
    
    tbody.innerHTML = livraisons.map(liv => `
      <tr>
        <td>${formatDate(liv.created_at)}</td>
        <td>
          <strong>${liv.agriculteur?.nom_ferme || 'N/A'}</strong><br>
          <small>${liv.agriculteur?.nom} ${liv.agriculteur?.prenom}</small>
        </td>
        <td>
          ${liv.campus?.nom || 'N/A'}<br>
          <small>${liv.campus?.ville || ''}</small>
        </td>
        <td>
          <strong>${formatPrice(liv.total_actuel)}</strong> / ${formatPrice(liv.seuil_prix)}<br>
          <small>${Math.round((liv.total_actuel / liv.seuil_prix) * 100)}%</small>
        </td>
        <td style="font-size: 0.9rem;">
          ${liv.creneau_valide ? 
            `<strong style="color: var(--success);">✓ ${formatDate(liv.date_livraison)}</strong>` :
            `
              1️⃣ ${formatDate(liv.creneau_1)}<br>
              2️⃣ ${formatDate(liv.creneau_2)}<br>
              3️⃣ ${formatDate(liv.creneau_3)}
            `
          }
        </td>
        <td>${getStatusBadge(liv.statut)}</td>
        <td>
          ${getActionButtons(liv)}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement livraisons:', error);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger);">Erreur de chargement</td></tr>';
  }
}

function getActionButtons(livraison) {
  const buttons = [];
  
  // Validation créneau (si en attente et pas encore validé)
  if (livraison.statut === 'en_attente' && !livraison.creneau_valide) {
    buttons.push(`<button class="btn btn-small" onclick="openValidationCreneau('${livraison.id}')">Valider créneau</button>`);
  }
  
  // Confirmer livraison (si seuil atteint)
  if (livraison.statut === 'seuil_atteint') {
    buttons.push(`<button class="btn btn-small btn-secondary" onclick="confirmerLivraison('${livraison.id}')">Confirmer</button>`);
  }
  
  // Marquer comme livrée
  if (livraison.statut === 'confirmee') {
    buttons.push(`<button class="btn btn-small" onclick="marquerLivree('${livraison.id}')">Marquer livrée</button>`);
  }
  
  // Détails
  buttons.push(`<button class="btn btn-small btn-outline" onclick="voirDetailsLivraison('${livraison.id}')">Détails</button>`);
  
  return buttons.join(' ');
}

async function openValidationCreneau(livraisonId) {
  try {
    const response = await fetch(`/api/livraisons/${livraisonId}`);
    const livraison = await response.json();
    
    const modalBody = document.getElementById('modal-creneau-body');
    modalBody.innerHTML = `
      <p><strong>Ferme :</strong> ${livraison.agriculteur.nom_ferme}</p>
      <p><strong>Campus :</strong> ${livraison.campus.nom}</p>
      <p><strong>Seuil :</strong> ${formatPrice(livraison.seuil_prix)}</p>
      <p><strong>Total actuel :</strong> ${formatPrice(livraison.total_actuel)}</p>
      
      <h4 style="margin-top: 1.5rem;">Choisir un créneau :</h4>
      
      <div style="display: grid; gap: 1rem; margin: 1rem 0;">
        <button class="btn btn-block" onclick="validerCreneau('${livraisonId}', 1)">
          <strong>Créneau 1 :</strong> ${formatDate(livraison.creneau_1)}
        </button>
        <button class="btn btn-block" onclick="validerCreneau('${livraisonId}', 2)">
          <strong>Créneau 2 :</strong> ${formatDate(livraison.creneau_2)}
        </button>
        <button class="btn btn-block" onclick="validerCreneau('${livraisonId}', 3)">
          <strong>Créneau 3 :</strong> ${formatDate(livraison.creneau_3)}
        </button>
      </div>
    `;
    
    openModal('modal-creneau');
  } catch (error) {
    console.error('Erreur:', error);
    showAlert('Erreur lors du chargement de la livraison', 'danger');
  }
}

async function validerCreneau(livraisonId, creneauNumero) {
  try {
    const response = await fetch(`/api/livraisons/${livraisonId}/valider-creneau`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creneau_numero: creneauNumero })
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    showAlert('Créneau validé avec succès !', 'success');
    closeModal('modal-creneau');
    loadLivraisons();
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message, 'danger');
  }
}

async function confirmerLivraison(livraisonId) {
  if (!confirm('Confirmer cette livraison ?')) return;
  
  try {
    const response = await fetch(`/api/livraisons/${livraisonId}/confirmer`, {
      method: 'PUT'
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    showAlert('Livraison confirmée !', 'success');
    loadLivraisons();
    loadStats();
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message, 'danger');
  }
}

async function marquerLivree(livraisonId) {
  if (!confirm('Marquer cette livraison comme effectuée ?')) return;
  
  try {
    const response = await fetch(`/api/livraisons/${livraisonId}/livree`, {
      method: 'PUT'
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    showAlert('Livraison marquée comme effectuée !', 'success');
    loadLivraisons();
    loadStats();
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message, 'danger');
  }
}

async function voirDetailsLivraison(livraisonId) {
  alert('Fonctionnalité à venir : Détails de la livraison avec liste des commandes');
}

// ====================================
// UTILISATEURS
// ====================================

async function loadUtilisateurs() {
  const tbody = document.getElementById('users-tbody');
  
  try {
    const response = await fetch('/api/utilisateurs'); // À créer dans server.js
    const users = await response.json();
    
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">Aucun utilisateur trouvé</td></tr>';
      return;
    }
    
    tbody.innerHTML = users.map(user => `
      <tr>
        <td><strong>${user.prenom} ${user.nom}</strong></td>
        <td>${user.email}</td>
        <td>${getRoleBadge(user.role)}</td>
        <td>${user.campus?.nom || user.nom_ferme || 'N/A'}</td>
        <td>${formatDate(user.created_at)}</td>
        <td>
          ${user.role !== 'admin' ? 
            `<button class="btn btn-small btn-danger" onclick="supprimerUtilisateur('${user.id}')">Supprimer</button>` :
            ''
          }
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement utilisateurs:', error);
    // Si la route n'existe pas encore, afficher un message
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--warning);">Route API à créer dans server.js</td></tr>';
  }
}

async function handleAddAgriculteur(e) {
  e.preventDefault();
  
  const formData = {
    prenom: document.getElementById('agriculteur-prenom').value,
    nom: document.getElementById('agriculteur-nom').value,
    email: document.getElementById('agriculteur-email').value,
    telephone: document.getElementById('agriculteur-telephone').value,
    nom_ferme: document.getElementById('agriculteur-nom-ferme').value,
    adresse_ferme: document.getElementById('agriculteur-adresse').value,
    description_ferme: document.getElementById('agriculteur-description').value,
    mot_de_passe: document.getElementById('agriculteur-password').value
  };
  
  try {
    const response = await fetch('/api/agriculteurs', { // À créer dans server.js
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    showAlert('Agriculteur créé avec succès !', 'success');
    closeModal('modal-agriculteur');
    document.getElementById('form-agriculteur').reset();
    loadUtilisateurs();
    loadStats();
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message || 'Route API à créer dans server.js', 'danger');
  }
}

async function supprimerUtilisateur(userId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
  
  try {
    const response = await fetch(`/api/utilisateurs/${userId}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (!response.ok) throw new Error(data.error);
    
    showAlert('Utilisateur supprimé', 'success');
    loadUtilisateurs();
    loadStats();
  } catch (error) {
    console.error('Erreur:', error);
    showAlert(error.message || 'Route API à créer', 'danger');
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
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">Aucune commande trouvée</td></tr>';
      return;
    }
    
    tbody.innerHTML = commandes.map(cmd => `
      <tr>
        <td>${formatDate(cmd.created_at)}</td>
        <td>
          <strong>${cmd.etudiant?.nom} ${cmd.etudiant?.prenom}</strong><br>
          <small>${cmd.etudiant?.email}</small>
        </td>
        <td>
          ${cmd.livraison?.campus?.nom || 'N/A'}<br>
          <small>${formatDate(cmd.livraison?.date_livraison)}</small>
        </td>
        <td><strong>${formatPrice(cmd.montant_total)}</strong></td>
        <td>${getPaymentBadge(cmd.statut_paiement)}</td>
        <td>
          <button class="btn btn-small btn-outline" onclick="voirDetailsCommande('${cmd.id}')">Voir</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erreur chargement commandes:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Erreur de chargement</td></tr>';
  }
}

async function voirDetailsCommande(commandeId) {
  alert('Fonctionnalité à venir : Détails de la commande avec produits');
}

// ====================================
// FONCTIONS UTILITAIRES
// ====================================

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: '2-digit', 
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

function getRoleBadge(role) {
  const badges = {
    'admin': '<span class="badge badge-danger">Admin</span>',
    'agriculteur': '<span class="badge">Agriculteur</span>',
    'etudiant': '<span class="badge badge-info">Étudiant</span>'
  };
  return badges[role] || role;
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
`;
document.head.appendChild(style);
