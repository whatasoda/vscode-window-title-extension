# VSCode Window Title Extension with Worktree Support

Git worktreeのディレクトリを開いているとき、VSCodeのwindow titleにworktree名を表示する拡張機能です。

## 3つのアプローチ

### 1. 拡張機能として使用（安全）
```bash
bun run install-extension
```

### 2. VSCodeを直接パッチ（推奨・個人利用）
```bash
# パッチを適用
node vscode-patcher.js

# パッチを元に戻す
node vscode-patcher.js --restore
```

### 3. VSCodeソースコードを修正（開発者向け）
`vscode-patch.md`を参照してソースからビルド

## パッチ後の使用方法

VSCodeの設定で`${worktreeName}`変数が使用可能になります：

```json
{
    "window.title": "${activeEditorShort}${separator}${rootName}${separator}${worktreeName}"
}
```

## 機能

- Git worktree名の自動検出
- VSCodeの標準変数システムに統合
- 既存の変数との組み合わせ可能
- macOS/Windows/Linux対応

## 注意事項

- パッチ方法はVSCode更新時に再適用が必要
- 自己責任での使用
- バックアップが自動作成されます