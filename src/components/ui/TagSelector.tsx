'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Tag } from '@/app/actions/tags';

interface TagSelectorProps {
    availableTags: Tag[];
    selectedTags: string[]; // array of tag names
    onTagsChange: (tags: string[]) => void;
    isLoading?: boolean;
}

export function TagSelector({ availableTags, selectedTags, onTagsChange, isLoading }: TagSelectorProps) {
    const [open, setOpen] = React.useState(false);

    const toggleTag = (tagName: string) => {
        const newTags = selectedTags.includes(tagName)
            ? selectedTags.filter(t => t !== tagName)
            : [...selectedTags, tagName];
        onTagsChange(newTags);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <span className="flex items-center">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                        </span>
                    ) : selectedTags.length > 0 ? (
                        <div className="flex gap-1 flex-wrap overflow-hidden">
                            {selectedTags.map(tagName => {
                                const tag = availableTags.find(t => t.name === tagName);
                                const color = tag ? (tag.color.startsWith('#') ? tag.color : `#${tag.color}`) : '#ccc';
                                return (
                                    <span
                                        key={tagName}
                                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground"
                                        style={{ borderLeft: `4px solid ${color}` }}
                                    >
                                        {tagName}
                                    </span>
                                );
                            })}
                        </div>
                    ) : (
                        "Select tags..."
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
                <Command>
                    <CommandInput placeholder="Search tags..." />
                    <CommandList>
                        <CommandEmpty>No tags found.</CommandEmpty>
                        <CommandGroup>
                            {availableTags.map((tag) => (
                                <CommandItem
                                    key={tag.id}
                                    value={tag.name}
                                    onSelect={() => toggleTag(tag.name)}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            selectedTags.includes(tag.name) ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div
                                        className="w-3 h-3 rounded-full mr-2"
                                        style={{ backgroundColor: tag.color.startsWith('#') ? tag.color : `#${tag.color}` }}
                                    />
                                    {tag.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
