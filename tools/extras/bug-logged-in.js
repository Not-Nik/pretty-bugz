// Turns the logged-out bug.html fixture into a logged-in BugModal page, following BMO's
// edit.html.tmpl: the change form, Edit/Save buttons, top actions and the comment box.
// Add ?edit to the URL (harness --query) to also simulate edit mode.
(() => {
  const main = document.getElementById("main-inner");
  const toolbar = document.getElementById("page-toolbar");
  const bottom = document.getElementById("bottom-actions");
  if (!main || !toolbar || !bottom) return;

  const form = document.createElement("form");
  form.name = "changeform";
  form.id = "changeform";
  form.method = "post";
  form.action = "process_bug.cgi";
  form.innerHTML = '<input type="hidden" name="id" id="bug_id" value="1000000"><input type="hidden" name="editing" id="editing" value="">';
  main.insertBefore(form, toolbar);
  let node = toolbar;
  while (node) {
    const next = node.nextSibling;
    form.append(node);
    if (node === bottom) break;
    node = next;
  }

  toolbar.querySelector(".buttons").insertAdjacentHTML("beforeend",
    '<button type="button" class="secondary" id="cc-btn" data-is-cced="0">Follow</button>'
    + '<button type="button" id="cancel-btn" class="secondary" aria-label="Cancel Editing" style="display:none">Cancel</button>'
    + '<button type="button" id="mode-btn" class="primary"><span id="mode-btn-readonly">Edit Bug</span></button>'
    + '<button type="submit" id="commit-btn" class="save-btn primary" style="display:none">Save Changes</button>');

  document.getElementById("comment-actions")?.insertAdjacentHTML("beforebegin",
    '<div id="top-actions"><button type="submit" class="save-btn primary" id="top-save-btn" style="display:none">Save Changes</button></div>');

  document.getElementById("new-comment-notice")?.replaceWith(Object.assign(document.createElement("div"), {
    innerHTML: '<div id="add-comment"><div class="comment-editor"><textarea id="comment" name="comment" rows="5" placeholder="Add a comment"></textarea></div></div>'
      + '<div id="new-comment-actions"><button type="submit" class="save-btn primary" id="bottom-save-btn">Save Changes</button>'
      + '<div id="resolve-as"> Resolve as <button type="button" class="secondary resolution-btn">FIXED</button> <button type="button" class="secondary resolution-btn">INVALID</button></div></div>',
  }));

  if (new URLSearchParams(location.search).has("edit")) {
    document.getElementById("mode-btn").style.display = "none";
    for (const id of ["cancel-btn", "commit-btn", "top-save-btn"]) document.getElementById(id).style.display = "inline-block";
    for (const el of document.querySelectorAll(".edit-hide")) el.style.display = "none";
    for (const el of document.querySelectorAll(".edit-show")) el.style.display = "";
  }
})();
