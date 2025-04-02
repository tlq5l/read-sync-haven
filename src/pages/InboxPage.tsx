import type React from "react";

const InboxPage: React.FC = () => {
	return (
		<div className="p-4">
			<h1 className="text-2xl font-bold mb-4">Inbox</h1>
			<p>Inbox articles will be displayed here.</p>
			{/* TODO: Implement article list filtering for Inbox */}
		</div>
	);
};

export default InboxPage;
