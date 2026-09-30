// Turns the buglist.html fixture into "Change Several Bugs at Once" (tweak) mode, following
// BMO's list.html.tmpl, table.html.tmpl and edit-multiple.html.tmpl.
(() => {
  const table = document.querySelector("table.bz_buglist");
  if (!table) return;
  table.classList.remove("responsive");

  const form = document.createElement("form");
  form.name = "changeform";
  form.method = "post";
  form.action = "process_bug.cgi";
  table.before(form);
  form.append(table);

  for (const row of table.querySelectorAll("thead tr")) {
    row.insertAdjacentHTML("afterbegin", '<th class="first-child">&nbsp;</th>');
  }
  for (const row of table.querySelectorAll("tr.bz_bugitem")) {
    const id = row.id.slice(1);
    row.insertAdjacentHTML("afterbegin", `<td class="bz_checkbox_column"><input type="checkbox" name="id_${id}"></td>`);
  }

  form.insertAdjacentHTML("beforeend", `
    <input type="hidden" name="dontchange" value="--do_not_change--">
    <input type="button" id="uncheck_all" name="uncheck_all" value="Uncheck All">
    <input type="button" id="check_all" name="check_all" value="Check All">
    <hr>
    <p style="font-size: var(--font-size-small);">To change multiple bugs:</p>
    <table id="form"><tr><th><label for="priority">Priority:</label></th><td>
      <select id="priority" name="priority"><option value="--do_not_change--">--do_not_change--</option><option>P1</option><option>P2</option></select>
    </td></tr></table>
    <textarea id="comment" name="comment" rows="5" cols="80"></textarea>
    <input type="submit" id="commit" value="Commit">`);
  document.getElementById("check_all").addEventListener("click", () => {
    for (const box of form.querySelectorAll('input[name^="id_"]')) box.checked = true;
  });
})();
