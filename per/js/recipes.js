"use strict";

import { Storage } from "./storage.js";
import { toast } from "./ui.js";

const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

let storage = null;
let currentRecipes = [];
let editingRecipeId = null;

async function ensureStorage() {
  if (!storage) {
    storage = new Storage();
    await storage.init();
  }
}

export async function initRecipes() {
  const view = qs("#view-recipes");
  if (!view) return;

  view.innerHTML = `
    <div class="section-header">
      <h2><span class="icon icon-recipe"></span> Przepisy</h2>
      <button id="add-recipe-btn" class="btn-primary">+ Dodaj przepis</button>
    </div>
    <div class="toolbar">
      <input type="search" id="recipe-search" placeholder="Szukaj przepisu..." />
      <select id="recipe-category-filter">
        <option value="">Wszystkie kategorie</option>
        <option value="śniadanie">Śniadanie</option>
        <option value="obiad">Obiad</option>
        <option value="kolacja">Kolacja</option>
        <option value="deser">Deser</option>
        <option value="przekąska">Przekąska</option>
      </select>
    </div>
    <ul id="recipes-list" class="card-list"></ul>
  `;

  await ensureStorage();
  await loadRecipes();

  qs("#add-recipe-btn")?.addEventListener("click", () => openRecipeDialog());
  qs("#recipe-search")?.addEventListener("input", filterRecipes);
  qs("#recipe-category-filter")?.addEventListener("change", filterRecipes);
}

async function loadRecipes() {
  try {
    const all = await storage.getAll("recipes");
    currentRecipes = all.filter(r => !r.deleted);
    renderRecipes(currentRecipes);
  } catch (err) {
    console.error("Błąd ładowania przepisów:", err);
    toast("Nie udało się załadować przepisów");
  }
}

function renderRecipes(recipes) {
  const list = qs("#recipes-list");
  if (!list) return;

  if (!recipes.length) {
    list.innerHTML = `<li class="small muted">Brak przepisów. Dodaj pierwszy przepis!</li>`;
    return;
  }

  list.innerHTML = recipes.map(recipe => `
    <li class="card-item" data-id="${recipe.id}">
      <div class="card-row">
        <div class="card-logo-css">
          <span class="icon icon-recipe"></span>
        </div>
        <div class="card-main">
          <div class="card-title">${escapeHtml(recipe.title)}</div>
          <div class="small muted">${recipe.category || "Bez kategorii"} • ${recipe.prepTime || "?"} min</div>
        </div>
        <div class="card-actions">
          <button class="icon-btn view-recipe-btn" data-id="${recipe.id}" aria-label="Zobacz">
            <span class="icon icon-eye"></span>
          </button>
          <button class="icon-btn edit-recipe-btn" data-id="${recipe.id}" aria-label="Edytuj">
            <span class="icon icon-edit"></span>
          </button>
          <button class="icon-btn delete-recipe-btn" data-id="${recipe.id}" aria-label="Usuń">
            <span class="icon icon-trash"></span>
          </button>
        </div>
      </div>
    </li>
  `).join("");

  qsa(".view-recipe-btn").forEach(btn =>
    btn.addEventListener("click", () => viewRecipe(btn.dataset.id))
  );
  qsa(".edit-recipe-btn").forEach(btn =>
    btn.addEventListener("click", () => editRecipe(btn.dataset.id))
  );
  qsa(".delete-recipe-btn").forEach(btn =>
    btn.addEventListener("click", () => deleteRecipe(btn.dataset.id))
  );
}

function filterRecipes() {
  const searchTerm = qs("#recipe-search")?.value.toLowerCase() || "";
  const category = qs("#recipe-category-filter")?.value || "";

  const filtered = currentRecipes.filter(recipe => {
    const matchSearch =
      recipe.title.toLowerCase().includes(searchTerm) ||
      (recipe.ingredients && recipe.ingredients.toLowerCase().includes(searchTerm));
    const matchCategory = !category || recipe.category === category;
    return matchSearch && matchCategory;
  });

  renderRecipes(filtered);
}

function openRecipeDialog(recipeData = null) {
  editingRecipeId = recipeData?.id || null;

  const dialog = document.createElement("dialog");
  dialog.className = "dialog dialog-full";
  dialog.innerHTML = `
    <div class="dialog-content">
      <div>
        <h3>${recipeData ? "Edytuj przepis" : "Nowy przepis"}</h3>
      </div>
      <div style="overflow-y:auto; display:grid; gap:12px;">
        <label>
          <span>Nazwa przepisu *</span>
          <input type="text" id="recipe-title" value="${recipeData?.title || ""}" required />
        </label>
        <label>
          <span>Kategoria</span>
          <select id="recipe-category">
            <option value="">Wybierz kategorię</option>
            <option value="śniadanie" ${recipeData?.category === "śniadanie" ? "selected" : ""}>Śniadanie</option>
            <option value="obiad" ${recipeData?.category === "obiad" ? "selected" : ""}>Obiad</option>
            <option value="kolacja" ${recipeData?.category === "kolacja" ? "selected" : ""}>Kolacja</option>
            <option value="deser" ${recipeData?.category === "deser" ? "selected" : ""}>Deser</option>
            <option value="przekąska" ${recipeData?.category === "przekąska" ? "selected" : ""}>Przekąska</option>
          </select>
        </label>
        <label>
          <span>Czas przygotowania (minuty)</span>
          <input type="number" id="recipe-preptime" value="${recipeData?.prepTime || ""}" min="1" />
        </label>
        <label>
          <span>Liczba porcji</span>
          <input type="number" id="recipe-servings" value="${recipeData?.servings || ""}" min="1" />
        </label>
        <label>
          <span>Składniki (jeden w linii)</span>
          <textarea id="recipe-ingredients" rows="6">${recipeData?.ingredients || ""}</textarea>
        </label>
        <label>
          <span>Instrukcje przygotowania</span>
          <textarea id="recipe-instructions" rows="8">${recipeData?.instructions || ""}</textarea>
        </label>
      </div>
      <menu class="dialog-actions">
        <button class="btn-secondary" id="cancel-recipe-btn">Anuluj</button>
        <button class="btn-primary" id="save-recipe-btn">Zapisz</button>
      </menu>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  qs("#cancel-recipe-btn", dialog)?.addEventListener("click", () => {
    dialog.close();
    dialog.remove();
  });

  qs("#save-recipe-btn", dialog)?.addEventListener("click", () => saveRecipe(dialog));
}

async function saveRecipe(dialog) {
  const title = qs("#recipe-title", dialog).value.trim();
  if (!title) {
    toast("Podaj nazwę przepisu");
    return;
  }

  const recipeData = {
    title,
    category: qs("#recipe-category", dialog).value,
    prepTime: parseInt(qs("#recipe-preptime", dialog).value) || null,
    servings: parseInt(qs("#recipe-servings", dialog).value) || null,
    ingredients: qs("#recipe-ingredients", dialog).value.trim(),
    instructions: qs("#recipe-instructions", dialog).value.trim(),
    updatedAt: new Date().toISOString()
  };

  try {
    await ensureStorage();

    if (editingRecipeId) {
      await storage.update("recipes", editingRecipeId, recipeData);
      toast("Przepis zaktualizowany");
    } else {
      recipeData.id = `recipe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      recipeData.createdAt = recipeData.updatedAt;
      await storage.create("recipes", recipeData);
      toast("Przepis dodany");
    }

    dialog.close();
    dialog.remove();
    await loadRecipes();
  } catch (err) {
    console.error("Błąd zapisu przepisu:", err);
    toast("Nie udało się zapisać przepisu");
  }
}

function viewRecipe(id) {
  const recipe = currentRecipes.find(r => r.id === id);
  if (!recipe) return;

  const dialog = document.createElement("dialog");
  dialog.className = "dialog dialog-full";
  dialog.innerHTML = `
    <div class="dialog-content">
      <div>
        <h3>${escapeHtml(recipe.title)}</h3>
        <div class="small muted">
          ${recipe.category || "Bez kategorii"} • ${recipe.prepTime || "?"} min • ${recipe.servings || "?"} porcji
        </div>
      </div>
      <div style="overflow-y:auto; display:grid; gap:12px;">
        <div>
          <h4>Składniki:</h4>
          <pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(recipe.ingredients || "Brak składników")}</pre>
        </div>
        <div>
          <h4>Instrukcje:</h4>
          <pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(recipe.instructions || "Brak instrukcji")}</pre>
        </div>
      </div>
      <menu class="dialog-actions">
        <button class="btn-secondary" id="close-view-btn">Zamknij</button>
        <button class="btn-primary" id="edit-from-view-btn">Edytuj</button>
      </menu>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  qs("#close-view-btn", dialog)?.addEventListener("click", () => {
    dialog.close();
    dialog.remove();
  });

  qs("#edit-from-view-btn", dialog)?.addEventListener("click", () => {
    dialog.close();
    dialog.remove();
    editRecipe(id);
  });
}

function editRecipe(id) {
  const recipe = currentRecipes.find(r => r.id === id);
  if (recipe) openRecipeDialog(recipe);
}

async function deleteRecipe(id) {
  if (!confirm("Czy na pewno chcesz usunąć ten przepis?")) return;

  try {
    await ensureStorage();
    await storage.delete("recipes", id);
    toast("Przepis usunięty");
    await loadRecipes();
  } catch (err) {
    console.error("Błąd usuwania przepisu:", err);
    toast("Nie udało się usunąć przepisu");
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export default { initRecipes };
