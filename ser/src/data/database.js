const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data.json');
let DB = { profiles: {} };

// Asynchroniczne ładowanie danych
async function loadDatabase() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    DB = JSON.parse(data);
  } catch (err) {
    console.log('Nie znaleziono pliku bazy danych, tworzę nowy');
    DB = { profiles: {} };
  }
}

// Asynchroniczny zapis danych
let saveTimer = null;
let dirty = false;
async function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (dirty) {
      try {
        await fs.writeFile(DATA_FILE, JSON.stringify(DB, null, 2));
        dirty = false;
        console.log('Baza danych zapisana');
      } catch (err) {
        console.error('Błąd zapisu bazy danych:', err);
      }
    }
  }, 3000); // Zapis co 3 sekundy
}

function getProfile(token) {
  return DB.profiles[token] || null;
}

function saveProfile(token, profile) {
  DB.profiles[token] = profile;
  scheduleSave();
}

module.exports = {
  loadDatabase,
  scheduleSave,
  getProfile,
  saveProfile
};