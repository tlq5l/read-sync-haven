# Plan: Implement Persistent Chat History using Firestore

**Goal:** Implement persistent, cross-device chat history for the AI chat feature, leveraging Google Firestore for storage, managed by the Google Cloud Function (GCF), with the Cloudflare Worker acting as an authentication proxy.

**Architecture Overview:**

*   **Frontend (React):** Manages chat display, user input, and session identification (`sessionId`). Fetches history on load and sends new messages.
*   **Cloudflare Worker:** Acts as a secure proxy, authenticating requests and forwarding them to the appropriate GCF endpoint.
*   **Backend (GCF):** Handles core logic. Interacts with Firestore to store/retrieve chat history and communicates with the Google Generative AI service, providing necessary context.
*   **Database (Firestore):** Stores the full conversation history persistently, associated with a `sessionId`.

**Detailed Implementation Steps:**

1.  **Infrastructure Setup:**
    *   Create a Google Firestore database instance in the project's Google Cloud Platform environment.
    *   Define a data structure/collection (e.g., `conversations`) to store chat histories, likely keyed by `sessionId`. Each document could contain an array of message objects (`{ role: 'user' | 'assistant', content: string, timestamp: Date }`).
    *   Configure necessary IAM permissions for the GCF service account to read/write to Firestore.
    *   Ensure the GCF environment has the required Firestore client libraries installed (`@google-cloud/firestore`).

2.  **Google Cloud Function (GCF - `gcf-chat/src/index.ts`):**
    *   **Modify Chat Endpoint (`/chat`):**
        *   Update the request handler to expect `newMessage` and `sessionId` in the request body (instead of `content` and `message` directly, though `content` might still be needed if the article text is required context).
        *   Implement logic to read the *full* conversation history from Firestore using the provided `sessionId`. Handle cases where no history exists yet.
        *   Append the incoming `newMessage` (as a user role message) to the retrieved history array.
        *   Implement logic to select a relevant context window (e.g., the last N messages, `history.slice(-10)`) from the full history to send to the Google Generative AI model. This manages token limits.
        *   Format the prompt for the Google AI, including the selected context window (and potentially the article `content` if needed).
        *   Call the Google Generative AI service.
        *   Append the received AI response (as an assistant role message) to the *full* history array.
        *   Implement logic to write the *entire updated* history array back to Firestore under the `sessionId`.
        *   Modify the response sent back to the Cloudflare Worker/Frontend to contain *only the new AI response text*.
    *   **Create History Endpoint (`/history` - New):**
        *   Create a new HTTP request handler (e.g., using Express or Cloud Functions native routing).
        *   Expect a `sessionId` in the request (e.g., as a query parameter or in the request body).
        *   Implement logic to read the *full* conversation history from Firestore using the `sessionId`.
        *   Return the retrieved history array (or an empty array if none found) in the response body.

3.  **Cloudflare Worker (`bondwise-worker/src/handlers/api.ts` & `index.ts`):**
    *   **Update `/api/chat` Proxy Logic:**
        *   Modify `handleChat` to extract `newMessage` and `sessionId` from the incoming request body.
        *   Ensure the `fetch` call to the `gcfChatUrl` forwards *only* `newMessage` and `sessionId` (and `content` if still needed by GCF) in its body.
    *   **Add `/api/chat/history` Route & Proxy Logic (New):**
        *   In the main worker router (`bondwise-worker/src/index.ts`), add a new route definition for `/api/chat/history` (likely supporting GET or POST).
        *   Create a new handler function (e.g., `handleChatHistory` in `api.ts`) similar to `handleChat`.
        *   This handler should authenticate the request using `authenticateRequestWithClerk`.
        *   It should extract the `sessionId` from the request.
        *   It needs the URL for the *new* GCF history endpoint (this might require adding a new environment variable like `GCF_CHAT_HISTORY_URL` to `wrangler.toml` and `Env` type).
        *   It should proxy the request (including `sessionId`) to the GCF history endpoint using `fetch`.
        *   It should forward the response (containing the full history) back to the frontend.

4.  **React Frontend (`src/hooks/useChat.ts`):**
    *   **Session ID Management:** Implement logic to get or generate a unique `sessionId` for the current chat context (e.g., combining user ID and article ID, or generating a unique ID when the chat component mounts). This ID needs to be stable for a given user/article chat.
    *   **Fetch History on Load:**
        *   Use `useEffect` hook that runs when the component mounts or the `sessionId` changes.
        *   Inside the effect, make an asynchronous call (e.g., using `fetch` or a query library like `@tanstack/react-query`) to the new `/api/chat/history` endpoint, passing the `sessionId`.
        *   On success, update the `chatHistory` state with the full history received from the backend. Handle loading and error states.
    *   **Modify `handleChatSubmit` / `chatMutation`:**
        *   Update the `mutationFn` to send *only* the `chatInput` (as `newMessage`) and the current `sessionId` in the request body to `/api/chat`. Do *not* send the `history` array anymore.
        *   The optimistic update (adding the user message immediately to `chatHistory` state) remains the same.
        *   The `onSuccess` handler now receives only the *new* AI response text. Update the `chatHistory` state by appending this new AI message.

**Diagram (Conceptual - Firestore Approach):**

```mermaid
sequenceDiagram
    participant User
    participant Frontend (useChat)
    participant Worker (/api/*)
    participant GCF (/chat, /history)
    participant Firestore
    participant Google AI

    alt Initial Load / History Fetch
        Frontend (useChat)->>Frontend (useChat): Get/Generate sessionId
        Frontend (useChat)->>Worker (/api/*): GET /api/chat/history { sessionId }
        Worker (/api/*)->>GCF (/chat, /history): Forward history request { sessionId }
        GCF (/chat, /history)->>Firestore: GET history for sessionId
        Firestore-->>GCF (/chat, /history): Return stored history
        GCF (/chat, /history)-->>Worker (/api/*): Forward history response
        Worker (/api/*)-->>Frontend (useChat): Return full history
        Frontend (useChat)->>Frontend (useChat): Set chatHistory state
        Frontend (useChat)-->>User: Display chat history
    end

    alt Send New Message
        User->>Frontend (useChat): Enters new message
        Frontend (useChat)->>Frontend (useChat): Add user msg to local state (optimistic)
        Frontend (useChat)->>Worker (/api/*): POST /api/chat { newMessage, sessionId }
        Worker (/api/*)->>GCF (/chat, /history): Forward chat request { newMessage, sessionId }
        GCF (/chat, /history)->>Firestore: GET full history for sessionId
        Firestore-->>GCF (/chat, /history): Return stored history
        GCF (/chat, /history)->>GCF (/chat, /history): Append newMessage to history
        GCF (/chat, /history)->>GCF (/chat, /history): Select context window (last N)
        GCF (/chat, /history)->>Google AI: Send context window
        Google AI-->>GCF (/chat, /history): AI Response
        GCF (/chat, /history)->>GCF (/chat, /history): Append AI response to full history
        GCF (/chat, /history)->>Firestore: PUT updated full history
        Firestore-->>GCF (/chat, /history): Confirm storage
        GCF (/chat, /history)-->>Worker (/api/*): Return *new* AI response text
        Worker (/api/*)-->>Frontend (useChat): Forward AI response text
        Frontend (useChat)->>Frontend (useChat): Add AI msg to local state
        Frontend (useChat)-->>User: Display new AI response
    end
```

**Next Steps:** Transition to implementation mode (e.g., "Code" mode) to execute these changes across the frontend, worker, and GCF components.