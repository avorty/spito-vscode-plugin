import * as vscode from "vscode";
import * as yaml from "js-yaml";
import path from "path";
import { CompletionItem, CompletionItemKind } from "vscode";

let spitoYamls: SpitoConfWithPath[] = [];
let rulePathAndConfPath: Map<string, string> = new Map();

const allCompletions = {
  api: {
    pkg: { get: "method" },
    sys: {
      getDistro: "method",
      getDaemon: "method",
      getInitSystem: "method",
    },
    fs: {
      pathExists: "method",
      fileExists: "method",
      readFile: "method",
      fileContains: "method",
      removeComments: "method",
      find: "method",
      findAll: "method",
      getProperLines: "method",
      createFile: "method",
    },
    info: {
      log: "method",
      debug: "method",
      error: "method",
      warn: "method",
      important: "method",
    },
    sh: { command: "method" },
  },
};

export async function activate(context: vscode.ExtensionContext) {
  spitoYamls = await getAllSpitoConfs();
  rulePathAndConfPath = getRulePathAndConfPath(spitoYamls);

  watchForSpitoYamlChanges();

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      "lua",
      new ApiAutoCompletionProvider(),
      "."
    )
  );
}

function watchForSpitoYamlChanges() {
  const ymlWatcher = vscode.workspace.createFileSystemWatcher("**/spito.yml")
  const yamlWatcher = vscode.workspace.createFileSystemWatcher("**/spito.yaml")

  const updateVariableFn = async () => {
    spitoYamls = await getAllSpitoConfs();
    rulePathAndConfPath = getRulePathAndConfPath(spitoYamls);
  };

  onAnyChange(ymlWatcher, updateVariableFn);
  onAnyChange(yamlWatcher, updateVariableFn);
}

function onAnyChange(watcher: vscode.FileSystemWatcher, cb: (e: vscode.Uri) => void) {
  watcher.onDidChange(cb);
  watcher.onDidCreate(cb);
  watcher.onDidDelete(cb);
}

class ApiAutoCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    if (!rulePathAndConfPath.has(document.uri.path)) {
      return [];
    }

    let linePrefix = document
      .lineAt(position)
      .text.substring(0, position.character)
      .trim();

    if (linePrefix == "a") {
      const completionItem = new vscode.CompletionItem("api", vscode.CompletionItemKind.Module);
      completionItem.sortText = "!1";

      return [completionItem];
    }

    let lineWithoutPostfixDot = linePrefix;
    if (linePrefix.endsWith(".")) {
      lineWithoutPostfixDot = linePrefix.slice(0, -1);
    }

    const linePrefixSplit = lineWithoutPostfixDot.split(".");

    let completeObjectProperties = getValueByProperties(
      allCompletions,
      linePrefixSplit
    );

    if (
      !completeObjectProperties ||
      typeof completeObjectProperties !== "object"
    ) {
      return [];
    }

    const completionItems: CompletionItem[] = [];

    for (const key of Object.keys(completeObjectProperties)) {
      let completionItem: CompletionItem;

      if (typeof completeObjectProperties[key] === "object") {
        completionItem = new vscode.CompletionItem(key, vscode.CompletionItemKind.Module)
      } else if(completeObjectProperties[key] == "method") {
        completionItem = new CompletionItem(key, CompletionItemKind.Function)
      } else {
        completionItem = new CompletionItem(key, CompletionItemKind.Variable)
      }

      completionItem.sortText = "!1";
      completionItems.push(completionItem);
    }

    return completionItems;
  }

  resolveCompletionItem?(
    item: vscode.CompletionItem,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CompletionItem> {
    // TODO: implement it
    return;
  }
}

function getValueByProperties(
  obj: any,
  propertyArray: string[]
): any | undefined {
  return propertyArray.reduce(
    (currentObj, property) => currentObj?.[property],
    obj
  );
}

async function getAllSpitoConfs(): Promise<SpitoConfWithPath[]> {
  const spitoYmls = await vscode.workspace.findFiles("**/spito.yml");
  const spitoYamls = await vscode.workspace.findFiles("**/spito.yaml");

  const spitoConfsPaths = [...spitoYamls, ...spitoYmls];

  const filesBeingRead: Promise<Uint8Array>[] = [];

  for (const path of spitoConfsPaths) {
    filesBeingRead.push(
      vscode.workspace.fs.readFile(path) as Promise<Uint8Array>
    );
  }
  const readFiles: Uint8Array[] = await Promise.all(filesBeingRead);

  return readFiles
    .map((e) => e.toString())
    .map((e) => yaml.load(e) as SpitoConf)
    .map((e) => {
      // I do it because js-yaml library reads rules as object instead od Map
      e.rules = new Map(Object.entries(e.rules));
      return e;
    })
    .map((e, i): SpitoConfWithPath => {
      return {
        conf: e,
        selfPath: spitoConfsPaths[i].path,
      };
    });
}

function getRulePathAndConfPath(
  spitoYamls: SpitoConfWithPath[]
): Map<string, string> {
  const result: Map<string, string> = new Map();

  spitoYamls.forEach((spitoYaml) => {
    spitoYaml.conf.rules.forEach((ruleValue) => {
      let rulePath: string;
      if (typeof ruleValue == "string") {
        rulePath = ruleValue;
      } else {
        rulePath = ruleValue.path;
      }

      // Get absolute rulePath
      rulePath = path.join(spitoYaml.selfPath, "..", rulePath);

      result.set(rulePath, spitoYaml.selfPath);
    });
  });

  return result;
}

export function deactivate() {}

interface SpitoConfWithPath {
  selfPath: string;
  conf: SpitoConf;
}

interface SpitoConf {
  rules: Map<string, SpitoConfRule | string>;
}

interface SpitoConfRule {
  path: string;
  unsafe?: string;
}
