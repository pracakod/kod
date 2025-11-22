// Pomocnicze funkcje ogólne
function findItemById(id, items) {
  return items.find(x => x.id === id);
}

function xpNextFor(level) {
  return 100 * level;
}

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

module.exports = {
  findItemById,
  xpNextFor,
  generateToken
};