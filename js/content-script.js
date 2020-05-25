import * as diff2Html from "diff2html";
import * as Prism from "prismjs";

// language highlight
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-clike";

const LEFT_SIDE = "left";
const RIGHT_SIDE = "right";

const fileMap = {};
const popup = document.createElement("div");

/**
 * Update global file map after url change
 */
const updateFileMap = () => {
    let files = document.querySelectorAll(".file");
    files.forEach((file) => {
        let header = file.querySelector(".file-info > a");
        let fileName = header.textContent;
        let link = header.getAttribute("href");

        fileMap[fileName] = {
            ref: file,

            link: link,
        };
    });
    return files.length > 0;
};

/**
 * Register an event in analytics
 * @param {String} category
 * @param {String} action
 */
const sendEvent = (category, action, value) => {
    chrome.runtime.sendMessage({
        command: "event",
        category: category,
        action: action,
        value: value,
    });
};

/**
 * Message receiver to handle data
 */
chrome.runtime.onMessage.addListener(function (request) {
    switch (request.command) {
        case "refdiff-refactoring":
            popup.style.setProperty("display", "none");

            // check if diff files are loaded
            if (!updateFileMap()) {
                return;
            }

            // no refactorings found
            if (!request.data || !request.data.refactorings) {
                return;
            }

            console.log(
                "Loading: " + request.data.refactorings.length + " refactorings"
            );
            request.data.refactorings.forEach((refactoring) => {
                addRefactorings(fileMap, refactoring, LEFT_SIDE);
                addRefactorings(fileMap, refactoring, RIGHT_SIDE);
            });
    }
});

var debounceObserver = null;
const debounceObserverTimeout = 100;

/**
 * Initialize observers to trigger plugin update
 * @param {Array} selectors list of CSS selectors to observe
 */
const initObserver = (selectors) => {
    console.log("observer init!");
    const observer = new MutationObserver(function (mutationsList) {
        for (let mutation of mutationsList) {
            if (mutation.type === "childList") {
                clearTimeout(debounceObserver);
                debounceObserver = setTimeout(function () {
                    console.log("Content changed!");

                    // request data from firebase
                    chrome.runtime.sendMessage({
                        command: "refdiff-refactoring",
                        url: document.location.href.split("#diff")[0],
                    });
                }, debounceObserverTimeout);
            }
        }
    });

    selectors.forEach((selector) => {
        const targetNode = document.querySelector(selector);
        observer.observe(targetNode, {
            attributes: false,
            childList: true,
            subtree: true,
        });
    });
};

/**
 * Plugin initialization after page load
 */
window.addEventListener("load", function () {
    console.log("filed loaded!!");
    initObserver(["#js-repo-pjax-container"]);

    popup.setAttribute("class", "diff-refector-popup");
    popup.innerHTML = `
        <button class="diff-refector-popup-close btn btn-sm btn-default">x</button>
        <p><b class="refactor-type"></b></p>
        <div class="refactor-content"></div>
        <div class="refactor-diff-code"></div>
        <div class="d2h-wrapper refactor-diff-extration-wrapper">
            <div class="d2h-file-wrapper">
                <div class="d2h-file-header">
                    <span class="d2h-file-name-wrapper">
                        <svg aria-hidden="true" class="d2h-icon" height="16" version="1.1" viewBox="0 0 12 16" width="12">
                            <path d="M6 5H2v-1h4v1zM2 8h7v-1H2v1z m0 2h7v-1H2v1z m0 2h7v-1H2v1z m10-7.5v9.5c0 0.55-0.45 1-1 1H1c-0.55 0-1-0.45-1-1V2c0-0.55 0.45-1 1-1h7.5l3.5 3.5z m-1 0.5L8 2H1v12h10V5z"></path>
                        </svg>
                        <span class="d2h-file-name refactor-diff-extraction-name"></span>
                        <span class="d2h-tag d2h-moved d2h-moved-tag">EXTRACT</span>
                    </span>
                </div>
                <div class="refactor-diff-extraction"></div>
            </div>
        </div>
        <a class="btn btn-sm btn-primary refactor-link" href="#">Go to source</a>
    `;

    popup.show = function (
        element,
        type,
        contentHTML,
        link,
        buttonText,
        side,
        diff
    ) {
        popup.style.setProperty("display", "block");
        popup.querySelector(".refactor-content").innerHTML = contentHTML;
        popup.querySelector(".refactor-type").innerText = type;
        popup.querySelector(".refactor-diff-code").innerHTML = diff.code || "";
        popup.querySelector(
            ".refactor-diff-extraction"
        ).innerHTML = diff.extraction
            ? `<pre><code class="language-java">${diff.extraction}</code></pre>`
            : "";

        if (diff.extraction) {
            popup
                .querySelector(".refactor-diff-extration-wrapper")
                .style.setProperty("display", "block");

            popup.querySelector(".refactor-diff-extraction-name").innerText =
                diff.filename;
        } else {
            popup
                .querySelector(".refactor-diff-extration-wrapper")
                .style.setProperty("display", "none");
        }

        if (link) {
            let button = popup.querySelector(".refactor-link");
            button.setAttribute("href", link);
            button.textContent = buttonText;
        }

        // pop-up offset to align box in left side
        let offset = popup.getBoundingClientRect().width + 10;

        let bounds = element.getBoundingClientRect();
        let left = (window.pageXOffset || element.scrollLeft) + bounds.left;
        let top = (window.pageYOffset || element.scrollTop) + bounds.top;

        // check if exists another open modal with unfinished time
        const lastTime = popup.getAttribute("data-time");
        if (lastTime) {
            const duration = (+new Date() - lastTime) / 1000.0;
            sendEvent("duration-type", type, duration);
            sendEvent("duration-side", side, duration);
        }

        console.log(top, left);

        popup.style.setProperty("top", top + "px");
        popup.style.setProperty("left", left - offset + "px");
        popup.setAttribute("data-time", +new Date());
        popup.setAttribute("data-type", type);
        popup.setAttribute("data-side", side);

        sendEvent("open-type", type);
        sendEvent("open-side", side);
    };

    document.body.appendChild(popup);
    document
        .querySelector(".diff-refector-popup-close")
        .addEventListener("click", function () {
            const type = popup.getAttribute("data-type");
            const side = popup.getAttribute("data-side");
            const openTime = Number(popup.getAttribute("data-time"));
            const duration = (+new Date() - openTime) / 1000.0;

            popup.removeAttribute("data-time");
            sendEvent("duration-type", type, duration);
            sendEvent("duration-side", side, duration);
            popup.style.setProperty("display", "none");
        });
});

/**
 *
 * @param {Object} fileMap pair of file and page anchor
 * @param {Object} refactoring refactoring data
 * @param {LEFT_SIDE|RIGHT_SIDE} side diff side
 */
const addRefactorings = (fileMap, refactoring, side) => {
    const diff = {};
    if (refactoring.diff) {
        const afterFileName = refactoring.extraction
            ? refactoring.before_file_name
            : refactoring.after_file_name;
        diff.code = diff2Html.html(
            `--- a/${refactoring.before_file_name}\n+++ b/${afterFileName}\n${refactoring.diff}`,
            {
                drawFileList: false,
                outputFormat: refactoring.extraction
                    ? "line-by-line"
                    : "side-by-side",
            }
        );
    }

    if (refactoring.extraction) {
        diff.filename = refactoring.after_file_name;
        diff.extraction = Prism.highlight(
            refactoring.extraction,
            Prism.languages[refactoring.language || "clike"],
            refactoring.language || "clike"
        );
    }

    let beforeFile = fileMap[refactoring.before_file_name];
    let afterFile = fileMap[refactoring.after_file_name];

    if (!beforeFile || !afterFile) {
        return;
    }

    // right side (addiction)
    let lineNumber = refactoring.after_line_number;
    let selector = ".blob-code.blob-code-addition";
    let buttonText = "Go to source";
    let baseFile = afterFile.ref;
    let link = `${beforeFile.link}L${refactoring.before_line_number}`;

    // left side (deletion)
    if (side === LEFT_SIDE) {
        lineNumber = refactoring.before_line_number;
        selector = ".blob-code.blob-code-deletion";
        buttonText = "Go to target";
        baseFile = beforeFile.ref;
        link = `${afterFile.link}R${refactoring.after_line_number}`;
    }

    baseFile.querySelectorAll(selector).forEach((line) => {
        if (
            !line.querySelector(`[data-line="${lineNumber}"]`) ||
            line.querySelector(".btn-refector")
        ) {
            return;
        }

        let contentHTML;
        let title = `${refactoring.type} ${refactoring.object_type}`;
        switch (refactoring.type) {
            case "RENAME":
                contentHTML = `<p><code>${refactoring.before_local_name}</code> renamed to <code>${refactoring.after_local_name}</code></p>`;
                break;
            case "MOVE":
            case "INTERNAL_MOVE":
                contentHTML = `<p><code>${refactoring.object_type.toLowerCase()} ${
                    refactoring.before_local_name
                }</code> moved.</p>`;
                contentHTML += `<p>Source: <code>${refactoring.before_file_name}:${refactoring.before_line_number}</code></p>`;
                contentHTML += `<p>Target: <code>${refactoring.after_file_name}:${refactoring.after_line_number}</code></p>`;
                break;
            case "EXTRACT_SUPER":
                title = "EXTRACT " + refactoring.object_type.toUpperCase();
                contentHTML = `<p>${refactoring.object_type.toLowerCase()} <code> ${
                    refactoring.after_local_name
                }</code> extracted from class <code>${
                    refactoring.before_local_name
                }</code>.</p>`;
                contentHTML += `<p>Source: <code>${refactoring.before_file_name}:${refactoring.before_line_number}</code></p>`;
                contentHTML += `<p>Target: <code>${refactoring.after_file_name}:${refactoring.after_line_number}</code></p>`;
                break;
            case "EXTRACT":
            case "EXTRACT_MOVE":
                contentHTML = `<p>${refactoring.object_type.toLowerCase()} <code>${
                    refactoring.after_local_name
                }</code> extracted from <code>${refactoring.object_type.toLowerCase()} ${
                    refactoring.before_local_name
                }</code>.</p>`;
                contentHTML += `<p>Source: <code>${refactoring.before_file_name}:${refactoring.before_line_number}</code></p>`;
                contentHTML += `<p>Target: <code>${refactoring.after_file_name}:${refactoring.after_line_number}</code></p>`;
                break;
            case "INLINE":
                contentHTML = `<p>Inline function <code>${refactoring.object_type.toLowerCase()} ${
                    refactoring.before_local_name
                }</code> in <code> ${refactoring.after_local_name}</code>.</p>`;
                contentHTML += `<p>Source: <code>${refactoring.before_file_name}:${refactoring.before_line_number}</code></p>`;
                contentHTML += `<p>Target: <code>${refactoring.after_file_name}:${refactoring.after_line_number}</code></p>`;
                break;
            default:
                refactoring.type = refactoring.type.replace("_", " ");
                title = `${refactoring.type} ${refactoring.object_type}`;
                contentHTML = `<p>${
                    refactoring.type
                }: ${refactoring.object_type.toLowerCase()} <code>${
                    refactoring.before_local_name
                }</code></p>`;
                contentHTML += `<p>Source: <code>${refactoring.before_file_name}:${refactoring.before_line_number}</code></p>`;
                contentHTML += `<p>Target: <code>${refactoring.after_file_name}:${refactoring.after_line_number}</code></p>`;
        }

        let button = document.createElement("button");
        button.setAttribute("class", "btn-refector");
        button.addEventListener("click", () => {
            popup.show(
                button,
                title,
                contentHTML,
                link,
                buttonText,
                side,
                diff
            );
        });
        button.innerText = "R";
        line.appendChild(button);
    });
};
