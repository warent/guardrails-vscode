"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
let documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
connection.onInitialize((params) => {
    let capabilities = params.capabilities;
    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    hasDiagnosticRelatedInformationCapability = !!(capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation);
    const result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: [
                    ".",
                    ":",
                    "<",
                    '"',
                    "=",
                    "/",
                    "a-z",
                    "A-Z",
                    "{",
                    "$",
                ],
            },
        },
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true,
            },
        };
    }
    return result;
});
connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders((_event) => {
            connection.console.log("Workspace folder change event received.");
        });
    }
});
// This handler provides the initial list of the completion items.
connection.onCompletion(({ textDocument, position, }) => {
    const doc = documents.get(textDocument.uri);
    const line = doc?.getText({
        start: {
            line: position.line,
            character: 0,
        },
        end: position,
    }) ?? "";
    let isInVariable = false;
    for (let i = line.length - 1; i > 0; i--) {
        if (line[i] == "{" && line[i - 1] == "$") {
            isInVariable = true;
            break;
        }
        if (line[i] == "}")
            break;
    }
    if (isInVariable) {
        return [
            {
                label: "gr.json_suffix_prompt",
                kind: node_1.CompletionItemKind.Variable,
            },
            {
                label: "gr.xml_prefix_prompt",
                kind: node_1.CompletionItemKind.Variable,
            },
        ];
    }
    return [];
});
// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item) => {
    if (item.label === "gr.json_suffix_prompt") {
        item.detail = "JSON Suffix Prompt";
        item.documentation =
            "Return a valid JSON object that respects this XML format and extracts only the information requested in this document. Respect the types indicated in the XML -- the information you extract should be converted into the correct 'type'. Try to be as correct and concise as possible. Find all relevant information in the document. If you are unsure of the answer, enter 'None'. If you answer incorrectly, you will be asked again until you get it right which is expensive.";
    }
    else if (item.label === "gr.xml_prefix_prompt") {
        item.detail = "XML Prefix Prompt";
        item.documentation =
            "Given below is XML that describes the information to extract from this document and the tags to extract it into.";
    }
    return item;
});
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map