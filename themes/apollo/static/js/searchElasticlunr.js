window.onload = function () {
  if (!document.body.contains(document.getElementById("searchModal"))) {
    return;
  }

  const lang = document.documentElement.lang.substring(0, 2);
  const searchInput = document.getElementById("searchInput");
  const searchModal = document.getElementById("searchModal");
  const searchButton = document.getElementById("search-button");
  const clearSearchButton = document.getElementById("clear-search");
  const resultsContainer = document.getElementById("results-container");
  const results = document.getElementById("results");

  const resultSpans = {
    zero_results: document.getElementById("zero_results"),
    one_results: document.getElementById("one_results"),
    two_results: document.getElementById("two_results"),
    few_results: document.getElementById("few_results"),
    many_results: document.getElementById("many_results"),
  };

  function getShortcut() {
    return window.navigator.userAgent.toLowerCase().includes("mac")
      ? "Cmd + K"
      : "Ctrl + K";
  }

  ["title", "aria-label"].forEach((attr) => {
    const value = searchButton.getAttribute(attr);
    if (value) {
      searchButton.setAttribute(
        attr,
        value.replace("$SHORTCUT", getShortcut()),
      );
    }
  });

  let lastFocusedElement;
  let fusePromise = null;

  function getBasePath() {
    let basePath = document
      .querySelector("meta[name='base']")
      .getAttribute("content");
    if (basePath.endsWith("/")) basePath = basePath.slice(0, -1);
    return basePath;
  }

  function normalizeDocs(json) {
    if (Array.isArray(json)) return json;

    if (json && json.documentStore && json.documentStore.docs) {
      return Object.values(json.documentStore.docs);
    }

    if (json && json.docs) return Object.values(json.docs);

    return [];
  }

  function loadSearchIndex() {
    if (!fusePromise) {
      const url = `${getBasePath()}/search_index.${lang}.json`;

      fusePromise = fetch(url)
        .then((response) => response.json())
        .then((json) => {
          const docs = normalizeDocs(json);

          return new Fuse(docs, {
            includeScore: true,
            shouldSort: true,
            ignoreLocation: true,
            threshold: 0.35,
            minMatchCharLength: 1,
            keys: [
              { name: "title", weight: 3 },
              { name: "body", weight: 2 },
              { name: "description", weight: 1 },
              { name: "path", weight: 1 },
            ],
          });
        });
    }

    return fusePromise;
  }

  function clearSearch() {
    searchInput.value = "";
    results.innerHTML = "";
    resultsContainer.style.display = "none";
    clearSearchButton.style.display = "none";
    searchInput.removeAttribute("aria-activedescendant");
  }

  function openSearchModal() {
    lastFocusedElement = document.activeElement;
    loadSearchIndex();
    searchModal.style.display = "block";
    searchInput.focus();
  }

  function closeModal() {
    searchModal.style.display = "none";
    clearSearch();

    if (lastFocusedElement && document.body.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
    }
  }

  function toggleModalVisibility() {
    if (searchModal.style.display === "block") {
      closeModal();
    } else {
      openSearchModal();
    }
  }

  function updateResultText(count) {
    Object.values(resultSpans).forEach((span) => {
      if (span) span.style.display = "none";
    });

    const key =
      count === 0
        ? "zero_results"
        : count === 1
          ? "one_results"
          : "many_results";

    const span = resultSpans[key];
    if (span) {
      span.style.display = "inline";
      span.textContent = span.textContent.replace("$NUMBER", count.toString());
    }
  }

  function makeSnippet(doc, term) {
    const text = doc.body || doc.description || "";
    if (!text) return "";

    const index = text.indexOf(term);
    if (index === -1) {
      return text.length > 150 ? text.substring(0, 150) + "…" : text;
    }

    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + term.length + 100);

    return (
      (start > 0 ? "…" : "") +
      text.substring(start, index) +
      "<b>" +
      text.substring(index, index + term.length) +
      "</b>" +
      text.substring(index + term.length, end) +
      (end < text.length ? "…" : "")
    );
  }

  function updateSelection(div) {
    results.querySelectorAll("#results > div").forEach((item) => {
      item.setAttribute("aria-selected", item === div ? "true" : "false");
    });

    searchInput.setAttribute("aria-activedescendant", div.id);
  }

  searchButton.addEventListener("mouseover", loadSearchIndex);
  searchButton.addEventListener("click", openSearchModal);
  searchButton.addEventListener("touchstart", openSearchModal, {
    passive: true,
  });

  searchButton.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      searchButton.click();
    }
  });

  clearSearchButton.addEventListener("click", function () {
    clearSearch();
    searchInput.focus();
  });

  searchModal.addEventListener("click", function (event) {
    if (event.target === searchModal) {
      closeModal();
    }
    event.stopPropagation();
  });

  searchModal.addEventListener(
    "touchend",
    function (event) {
      if (event.target === searchModal) {
        closeModal();
      }
      event.stopPropagation();
    },
    { passive: true },
  );

  document.addEventListener("keydown", function (event) {
    const isMac = navigator.userAgent.toLowerCase().includes("mac");

    if (event.key === "Escape") {
      closeModal();
    }

    if (event.key === "k" && (isMac ? event.metaKey : event.ctrlKey)) {
      event.preventDefault();
      toggleModalVisibility();
    }

    const resultDivs = Array.from(results.querySelectorAll("#results > div"));
    if (resultDivs.length === 0) return;

    const activeDiv = results.querySelector('[aria-selected="true"]');
    const activeIndex = resultDivs.indexOf(activeDiv);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateSelection(
        resultDivs[Math.min(activeIndex + 1, resultDivs.length - 1)],
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      updateSelection(resultDivs[Math.max(activeIndex - 1, 0)]);
    }

    if (event.key === "Enter" && activeDiv) {
      event.preventDefault();
      const link = activeDiv.querySelector("a");
      if (link) window.location.href = link.href;
      closeModal();
    }
  });

  searchInput.addEventListener(
    "input",
    async function () {
      const rawValue = this.value;
      const searchTerm = rawValue.trim();

      clearSearchButton.style.display = rawValue.length > 0 ? "block" : "none";
      resultsContainer.style.display = searchTerm.length > 0 ? "block" : "none";

      results.innerHTML = "";

      if (!searchTerm) {
        updateResultText(0);
        return;
      }

      const fuse = await loadSearchIndex();
      const searchResults = fuse.search(searchTerm).slice(0, 20);

      updateResultText(searchResults.length);

      let resultIdCounter = 0;

      searchResults.forEach(({ item }) => {
        if (!(item.title || item.path || item.id)) return;

        const resultDiv = document.createElement("div");
        resultDiv.setAttribute("role", "option");
        resultDiv.id = "result-" + resultIdCounter++;

        resultDiv.innerHTML = '<a href="#"><span></span><span></span></a>';

        const link = resultDiv.querySelector("a");
        const title = resultDiv.querySelector("span:first-child");
        const snippet = resultDiv.querySelector("span:nth-child(2)");

        title.textContent = item.title || item.path || item.id;
        snippet.innerHTML = makeSnippet(item, searchTerm);

        link.href = item.permalink || item.path || item.id;

        results.appendChild(resultDiv);
      });

      searchInput.setAttribute(
        "aria-expanded",
        resultIdCounter > 0 ? "true" : "false",
      );

      if (results.firstChild) {
        updateSelection(results.firstChild);
      }

      results.querySelectorAll("#results > div").forEach((div) => {
        div.addEventListener("mouseover", function () {
          updateSelection(div);
        });
        div.addEventListener(
          "touchstart",
          function () {
            updateSelection(div);
          },
          { passive: true },
        );
      });
    },
    true,
  );
};
