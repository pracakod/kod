"use strict";

import { getSession, getSupabase } from "./supabase-client.js";
import { toast } from "./ui.js";

const qs = (s) => document.querySelector(s);

export async function shareList(listId, listType = 'checklists') {
  const session = await getSession();
  const supabase = getSupabase();
  
  if (!session || !supabase) {
    toast('Musisz być zalogowany, aby udostępnić listę');
    return;
  }

  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.innerHTML = `
    <div class="dialog-content">
      <h3>Udostępnij listę</h3>
      <label>
        <span>Email użytkownika</span>
        <input type="email" id="share-email" placeholder="uzytkownik@example.com" />
      </label>
      <label>
        <span>Uprawnienia</span>
        <select id="share-permission">
          <option value="read">Tylko odczyt</option>
          <option value="write">Odczyt i edycja</option>
        </select>
      </label>
      <menu class="dialog-actions">
        <button class="btn-secondary" id="cancel-share-btn">Anuluj</button>
        <button class="btn-primary" id="confirm-share-btn">Udostępnij</button>
      </menu>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  qs('#cancel-share-btn').addEventListener('click', () => {
    dialog.close();
    dialog.remove();
  });

  qs('#confirm-share-btn').addEventListener('click', async () => {
    const email = qs('#share-email').value.trim();
    const permission = qs('#share-permission').value;

    if (!email) {
      toast('Podaj adres email');
      return;
    }

    try {
      // Znajdź użytkownika po email
      const { data: users, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (userError || !users) {
        toast('Nie znaleziono użytkownika');
        return;
      }

      // Utwórz udostępnienie
      const { error: shareError } = await supabase
        .from('shared_lists')
        .insert({
          list_id: listId,
          list_type: listType,
          shared_with: users.id,
          permission: permission,
          shared_by: session.user.id
        });

      if (shareError) throw shareError;

      toast('Lista została udostępniona');
      dialog.close();
      dialog.remove();

    } catch (error) {
      console.error('Błąd udostępniania:', error);
      toast('Nie udało się udostępnić listy');
    }
  });
}

export async function getSharedLists(listType = 'checklists') {
  const session = await getSession();
  const supabase = getSupabase();
  
  if (!session || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('shared_lists')
      .select('*')
      .eq('list_type', listType)
      .eq('shared_with', session.user.id);

    if (error) throw error;
    return data || [];

  } catch (error) {
    console.error('Błąd pobierania udostępnionych list:', error);
    return [];
  }
}

export async function revokeShare(shareId) {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('shared_lists')
      .delete()
      .eq('id', shareId);

    if (error) throw error;
    toast('Udostępnienie zostało cofnięte');

  } catch (error) {
    console.error('Błąd cofania udostępnienia:', error);
    toast('Nie udało się cofnąć udostępnienia');
  }
}

export default { shareList, getSharedLists, revokeShare };
