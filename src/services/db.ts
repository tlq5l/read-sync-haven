				// Filter in memory
				if (options?.isRead !== undefined) {
					docs = docs.filter((doc) => doc.isRead === options.isRead);
					console.log(`After isRead filter: ${docs.length} articles remain`);
				}
				if (options?.favorite !== undefined) {
					// Make sure favorite property exists and is explicitly true
					docs = docs.filter((doc) => doc.favorite === true);
					console.log(`After favorite filter: ${docs.length} articles remain`);
				}
				if (options?.tag && typeof options.tag === "string") {
					docs = docs.filter((doc) =>
						doc.tags?.includes(options.tag as string),
					);
					console.log(`After tag filter: ${docs.length} articles remain`);
				}
				
				// Enhanced userId filter to support both Clerk IDs and email addresses
				if (userIdFilter) {
					docs = docs.filter((doc) => {
						// If document has no userId, it shouldn't appear in filtered results
						if (!doc.userId) return false;
						
						// Match if either:
						// 1. The document userId matches exactly
						// 2. The document userId is an email and matches the filter (for extension imports)
						return doc.userId === userIdFilter || 
						       (doc.userId.includes('@') && userIdFilter.includes('@'));
					});
					
					console.log(`After userId filter: ${docs.length} articles remain`);
				}

				// Sort in memory
