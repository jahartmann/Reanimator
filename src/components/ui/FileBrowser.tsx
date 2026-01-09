'use client';

import { useState, useMemo } from 'react';
import { File, Folder, FolderOpen, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { Button } from './button';

interface FileEntry {
    path: string;
    size: number;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Build tree from flat file list
function buildTree(files: FileEntry[]): Record<string, any> {
    const root: Record<string, any> = {};
    for (const file of files) {
        const parts = file.path.split('/').filter(Boolean);
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                current[part] = { _file: true, _size: file.size, _path: file.path };
            } else {
                if (!current[part]) current[part] = { _children: {} };
                if (!current[part]._children) current[part]._children = {};
                current = current[part]._children;
            }
        }
    }
    return root;
}

function TreeNode({
    name,
    node,
    path,
    level = 0,
    selectedFiles,
    onToggleSelect,
    onOpen,
    currentFile
}: {
    name: string;
    node: any;
    path: string;
    level?: number;
    selectedFiles: Set<string>;
    onToggleSelect: (path: string, isFolder: boolean, node: any) => void;
    onOpen: (path: string) => void;
    currentFile: string | null;
}) {
    const [expanded, setExpanded] = useState(level < 1);
    const isFile = node._file;
    const isSelected = selectedFiles.has(isFile ? node._path : path);
    const isCurrent = currentFile === (isFile ? node._path : null);

    if (isFile) {
        return (
            <div
                className={`flex items-center gap-1 py-1 px-1 rounded cursor-pointer text-sm group ${isCurrent ? 'bg-primary/20 text-primary' : isSelected ? 'bg-blue-500/20' : 'hover:bg-muted/50'
                    }`}
                style={{ paddingLeft: `${level * 16 + 4}px` }}
            >
                <div
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground/50 group-hover:border-muted-foreground'
                        }`}
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(node._path, false, node); }}
                >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => onOpen(node._path)}>
                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{name}</span>
                    <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100">{formatBytes(node._size)}</span>
                </div>
            </div>
        );
    }

    const children = node._children || node;
    const childKeys = Object.keys(children).filter(k => !k.startsWith('_'));
    const fileCount = childKeys.length;

    return (
        <div>
            <div
                className={`flex items-center gap-1 py-1 px-1 rounded cursor-pointer text-sm group ${isSelected ? 'bg-blue-500/20' : 'hover:bg-muted/50'
                    }`}
                style={{ paddingLeft: `${level * 16 + 4}px` }}
            >
                <div
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground/50 group-hover:border-muted-foreground'
                        }`}
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(path, true, children); }}
                >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="flex items-center gap-1 flex-1" onClick={() => setExpanded(!expanded)}>
                    {expanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    {expanded ? (
                        <FolderOpen className="h-4 w-4 text-amber-500" />
                    ) : (
                        <Folder className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground ml-auto opacity-60">{fileCount}</span>
                </div>
            </div>
            {expanded && (
                <div>
                    {childKeys.sort((a, b) => {
                        const aNode = children[a];
                        const bNode = children[b];
                        const aIsFile = aNode._file;
                        const bIsFile = bNode._file;
                        if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
                        return a.localeCompare(b);
                    }).map(key => (
                        <TreeNode
                            key={key}
                            name={key}
                            node={children[key]}
                            path={`${path}/${key}`}
                            level={level + 1}
                            selectedFiles={selectedFiles}
                            onToggleSelect={onToggleSelect}
                            onOpen={onOpen}
                            currentFile={currentFile}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// Get all file paths under a folder node
function getAllFilesInFolder(node: any): string[] {
    const files: string[] = [];
    const children = node._children || node;
    for (const key of Object.keys(children).filter(k => !k.startsWith('_'))) {
        const child = children[key];
        if (child._file) {
            files.push(child._path);
        } else {
            files.push(...getAllFilesInFolder(child));
        }
    }
    return files;
}

export function FileBrowser({
    files,
    selectedFile,
    onSelectFile,
    onDownload
}: {
    files: FileEntry[];
    selectedFile: string | null;
    onSelectFile: (path: string) => void;
    onDownload: (paths: string[]) => void;
}) {
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const tree = useMemo(() => buildTree(files), [files]);

    function handleToggleSelect(path: string, isFolder: boolean, node: any) {
        const newSelected = new Set(selectedPaths);

        if (isFolder) {
            const folderFiles = getAllFilesInFolder(node);
            const allSelected = folderFiles.every(f => newSelected.has(f));

            if (allSelected) {
                folderFiles.forEach(f => newSelected.delete(f));
            } else {
                folderFiles.forEach(f => newSelected.add(f));
            }
        } else {
            if (newSelected.has(path)) {
                newSelected.delete(path);
            } else {
                newSelected.add(path);
            }
        }

        setSelectedPaths(newSelected);
    }

    function handleSelectAll() {
        if (selectedPaths.size === files.length) {
            setSelectedPaths(new Set());
        } else {
            setSelectedPaths(new Set(files.map(f => f.path)));
        }
    }

    function handleDownload() {
        onDownload(Array.from(selectedPaths));
    }

    const selectedSize = files
        .filter(f => selectedPaths.has(f.path))
        .reduce((sum, f) => sum + f.size, 0);

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="text-xs"
                >
                    {selectedPaths.size === files.length ? 'Alle abwählen' : 'Alle auswählen'}
                </Button>
                {selectedPaths.size > 0 && (
                    <>
                        <span className="text-xs text-muted-foreground">
                            {selectedPaths.size} ausgewählt ({formatBytes(selectedSize)})
                        </span>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handleDownload}
                            className="ml-auto text-xs"
                        >
                            Download
                        </Button>
                    </>
                )}
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-auto p-2 font-mono text-sm">
                {Object.keys(tree).sort().map(key => (
                    <TreeNode
                        key={key}
                        name={key}
                        node={tree[key]}
                        path={key}
                        selectedFiles={selectedPaths}
                        onToggleSelect={handleToggleSelect}
                        onOpen={onSelectFile}
                        currentFile={selectedFile}
                    />
                ))}
            </div>
        </div>
    );
}
