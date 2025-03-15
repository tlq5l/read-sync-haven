declare module "epubjs" {
	export interface EpubCFI {
		compare(cfiA: string, cfiB: string): number;
		parse(cfi: string): object;
		generate(element: Element | Range): string;
	}

	export interface Contents {
		on(event: string, callback: (event: any) => void): void;
		off(event: string, callback: (event: any) => void): void;
		width(): number;
		height(): number;
		element(query: string): Element;
		window(): Window;
		document(): Document;
		range(cfi: string): Range;
		text(cfi: string): string;
		cfiFromRange(range: Range): string;
	}

	export interface PackagingMetadata {
		direction: string;
		layout: string;
		orientation: string;
		spread: string;
		title: string;
		language: string;
		creator: string;
		publisher: string;
		identifier: string;
		modified_date: string;
		published_date: string;
		description: string;
		rights: string;
		metadataObject: {
			[key: string]: any;
		};
	}

	export interface NavItem {
		id: string;
		href: string;
		label: string;
		subitems: NavItem[];
		parent?: NavItem;
	}

	export interface Location {
		start: {
			index: number;
			href: string;
			cfi: string;
			displayed: {
				page: number;
				total: number;
			};
		};
		end: {
			index: number;
			href: string;
			cfi: string;
			displayed: {
				page: number;
				total: number;
			};
		};
		atStart: boolean;
		atEnd: boolean;
		percentage: number;
		location: number;
		displayed: {
			page: number;
			total: number;
		};
	}

	export interface Rendition {
		display(target?: string | number | Element): Promise<any>;
		next(): Promise<any>;
		prev(): Promise<any>;
		themes: {
			register(name: string, styles: object | string): void;
			select(name: string): void;
			fontSize(size: string): void;
		};
		flow(flow: string): void;
		spread(spread: string): void;
		on(event: string, callback: (event: any) => void): void;
		off(event: string, callback: (event: any) => void): void;
		hooks: {
			register(event: string, callback: (event: any) => void): void;
		};
		location: {
			current: Location;
		};
		views: () => any;
		themes: {
			default(): object;
			fontSize(size: string): void;
			font(name: string): void;
			themeName?: string;
			register(themeName: string, values: object): void;
			registered: object;
			select(themeName: string): void;
		};
	}

	export interface Book {
		loaded: Promise<Book>;
		ready: Promise<Book>;
		canonical(path: string): string;
		cover(): string;
		coverUrl(): string;
		destroy(): void;
		displayed(): Promise<any>;
		locations: {
			total: number;
			currentLocation(): Location;
			generate(spine?: any): Promise<any>;
			parse(locations: string): any;
		};
		navigation: {
			get(target: string): NavItem[];
			getByPath(path: string): NavItem;
			getTocByHref(href: string): NavItem;
			toc: NavItem[];
		};
		on(event: string, callback: (event: any) => void): void;
		off(event: string, callback: (event: any) => void): void;
		open(target?: string): Promise<Book>;
		package: {
			metadata: PackagingMetadata;
			spine: any;
		};
		rendition: Rendition;
		renderTo(element: Element | string, options?: object): Rendition;
		resources: object;
		section(target: string): Promise<any>;
		spine: {
			each(callback: (item: any, index: number) => void): void;
			get(target: string): any;
			items: any[];
			length: number;
			package: {
				metadata: PackagingMetadata;
			};
		};
		url: {
			Path: any;
			absolute(path: string): string;
			relative(path: string): string;
		};
		cfiFromRange(range: Range): string;
	}

	export default function (options: string | ArrayBuffer | object): Book;
}
