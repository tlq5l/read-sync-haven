import React from "react";
import {
	Shortcut,
	ShortcutGroup,
	formatShortcut,
} from "@/lib/keyboard-shortcuts";
import { cn } from "@/lib/utils";

interface ShortcutItemProps {
	shortcut: Shortcut;
}

export function ShortcutItem({ shortcut }: ShortcutItemProps) {
	return (
		<div className="flex justify-between items-center py-2">
			<div>
				<p className="font-medium">{shortcut.name}</p>
				<p className="text-sm text-muted-foreground">{shortcut.description}</p>
			</div>
			<div className="flex">
				<kbd className="inline-flex h-8 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-sm font-medium text-muted-foreground">
					{formatShortcut(shortcut.keys)}
				</kbd>
			</div>
		</div>
	);
}

interface ShortcutCategoryProps {
	title: string;
	description: string;
	shortcuts: Shortcut[];
}

export function ShortcutCategory({
	title,
	description,
	shortcuts,
}: ShortcutCategoryProps) {
	return (
		<div className="space-y-4 pt-4">
			<div>
				<h3 className="text-lg font-semibold">{title}</h3>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			<div className="space-y-2 divide-y">
				{shortcuts.map((shortcut) => (
					<ShortcutItem key={shortcut.id} shortcut={shortcut} />
				))}
			</div>
		</div>
	);
}

interface ShortcutDisplayProps {
	shortcuts: Shortcut[];
	className?: string;
}

export function ShortcutDisplay({
	shortcuts,
	className,
}: ShortcutDisplayProps) {
	// Group shortcuts by category
	const groupedShortcuts = shortcuts.reduce(
		(groups, shortcut) => {
			const category = shortcut.category;
			if (!groups[category]) {
				groups[category] = [];
			}
			groups[category].push(shortcut);
			return groups;
		},
		{} as Record<string, Shortcut[]>,
	);

	// Find the corresponding group information for each category
	const categories = Object.keys(groupedShortcuts).map((category) => {
		// Find the group info from shortcutGroups
		const groupInfo = shortcutGroups.find(
			(group) => group.category === category,
		);

		return {
			category,
			title:
				groupInfo?.title ||
				category.charAt(0).toUpperCase() + category.slice(1),
			description: groupInfo?.description || "",
			shortcuts: groupedShortcuts[category],
		};
	});

	return (
		<div className={cn("space-y-6", className)}>
			{categories.map((category) => (
				<ShortcutCategory
					key={category.category}
					title={category.title}
					description={category.description}
					shortcuts={category.shortcuts}
				/>
			))}
		</div>
	);
}

// Import shortcutGroups at the top level since it's used in the component
import { shortcutGroups } from "@/lib/keyboard-shortcuts";
