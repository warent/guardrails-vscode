import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  InsertTextFormat,
  TextEdit,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
  let capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
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
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

// // The example settings
// interface ExampleSettings {
//   maxNumberOfProblems: number;
// }

// // The global settings, used when the `workspace/configuration` request is not supported by the client.
// // Please note that this is not the case when using this server with the client provided in this example
// // but could happen with other clients.
// const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
// let globalSettings: ExampleSettings = defaultSettings;

// // Cache the settings of all open documents
// let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
  // if (hasConfigurationCapability) {
  //   // Reset all cached document settings
  //   documentSettings.clear();
  // } else {
  //   globalSettings = <ExampleSettings>(
  //     (change.settings.guardrailsAi || defaultSettings)
  //   );
  // }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

// function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
//   if (!hasConfigurationCapability) {
//     return Promise.resolve(globalSettings);
//   }
//   let result = documentSettings.get(resource);
//   if (!result) {
//     result = connection.workspace.getConfiguration({
//       scopeUri: resource,
//       section: "guardrailsAi",
//     });
//     documentSettings.set(resource, result);
//   }
//   return result;
// }

// // Only keep settings for open documents
// documents.onDidClose((e) => {
//   documentSettings.delete(e.document.uri);
// });

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // In this simple example we get the settings for every validate run.
  // let settings = await getDocumentSettings(textDocument.uri);

  // The validator creates diagnostics for all uppercase words length 2 and more
  let text = textDocument.getText();
  let pattern = /\b[A-Z]{2,}\b/g;
  let m: RegExpExecArray | null;

  let problems = 0;
  let diagnostics: Diagnostic[] = [];
  while ((m = pattern.exec(text)) && problems < 100) {
    problems++;
    let diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Warning,
      range: {
        start: textDocument.positionAt(m.index),
        end: textDocument.positionAt(m.index + m[0].length),
      },
      message: `${m[0]} is all uppercase.`,
      source: "ex",
    };
    if (hasDiagnosticRelatedInformationCapability) {
      diagnostic.relatedInformation = [
        {
          location: {
            uri: textDocument.uri,
            range: Object.assign({}, diagnostic.range),
          },
          message: "Spelling matters",
        },
        {
          location: {
            uri: textDocument.uri,
            range: Object.assign({}, diagnostic.range),
          },
          message: "Particularly for names",
        },
      ];
    }
    diagnostics.push(diagnostic);
  }

  // Send the computed diagnostics to VS Code.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VS Code
  connection.console.log("We received a file change event");
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
  ({
    textDocument,
    position,
  }: TextDocumentPositionParams): CompletionItem[] => {
    const doc = documents.get(textDocument.uri);
    const line =
      doc?.getText({
        start: {
          line: position.line,
          character: 0,
        },
        end: position,
      }) ?? "";

    let isInVariable = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] == "{" && line[i - 1] == "$") {
        isInVariable = true;
        break;
      }

      if (line[i] == "}") break;
    }
    if (isInVariable) {
      return [
        {
          label: "gr.json_suffix_prompt",
          kind: CompletionItemKind.Variable,
        },
        {
          label: "gr.xml_prefix_prompt",
          kind: CompletionItemKind.Variable,
        },
      ];
    }

    return [];
  }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  if (item.label === "gr.json_suffix_prompt") {
    item.detail = "JSON Suffix Prompt";
    item.documentation =
      "Return a valid JSON object that respects this XML format and extracts only the information requested in this document. Respect the types indicated in the XML -- the information you extract should be converted into the correct 'type'. Try to be as correct and concise as possible. Find all relevant information in the document. If you are unsure of the answer, enter 'None'. If you answer incorrectly, you will be asked again until you get it right which is expensive.";
  } else if (item.label === "gr.xml_prefix_prompt") {
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
