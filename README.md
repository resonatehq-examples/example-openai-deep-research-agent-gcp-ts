# Deep Research Agent on Google Cloud Functions

A Research Agent powered by Resonate and OpenAI, running on Google Cloud Functions. The Research Agent is a distributed, recursive agent that breaks a research topic into subtopics, researches each subtopic recursively, and synthesizes the results.

![Deep Research Agent Demo](doc/research-agent.jpeg)

## How It Works

This example demonstrates how complex, distributed agentic applications can be implemented with simple code in Resonate's Distributed Async Await: The research agent is a recursive generator function that breaks down topics into subtopics and invokes itself for each subtopic:

```typescript
function* research(ctx, topic, depth) {
  const messages = [
    { role: "system", content: "Break topics into subtopics..." },
    { role: "user", content: `Research ${topic}` }
  ];

  while (true) {
    // Ask the LLM about the topic
    const response = yield* ctx.run(prompt, messages, ...);
    messages.push(response);

    // If LLM wants to research subtopics...
    if (response.tool_calls) {
      const handles = [];

      // Spawn parallel research for each subtopic
      for (const tool_call of response.tool_calls) {
        const subtopic = ...;
        const handle = yield* ctx.beginRpc(research, subtopic, depth - 1);
        handles.push([tool_call, handle]);
      }

      // Wait for all subtopic results
      for (const [tool_call, handle] of handles) {
        const result = yield* handle;
        messages.push({ role: "tool", ..., content: result });
      }
    } else {
      // LLM provided final summary
      return response.content;
    }
  }
}
```

The following video visualizes how this recursive pattern creates a dynamic call graph, spawning parallel research branches that fan out as topics are decomposed, then fan back in as results are synthesized:

https://github.com/user-attachments/assets/cf466675-def3-4226-9233-a680cd7e9ecb

**Key concepts:**
- **Concurrent Execution**: Multiple subtopics are researched concurrently via `ctx.beginRpc`
- **Coordination**: Handles are collected first, then awaited together (fork/join, fan-out/fan-in)
- **Depth control**: Recursion stops when `depth` reaches 0

---

# Running the Example

You can run the Deep Research Agent locally on your machine with Google's Functions Framework or you can deploy the agent to Google Cloud Platform.

## 1. Running Locally

### 1.1. Prerequisites

Install the Resonate Server & CLI with [Homebrew](https://docs.resonatehq.io/operate/run-server#install-with-homebrew) or download the latest release from [Github](https://github.com/resonatehq/resonate/releases).

```
brew install resonatehq/tap/resonate
```

To run this project you also need an [OpenAI API Key](https://platform.openai.com) and export the key as an environment variable

```
export OPENAI_API_KEY="sk-..."
```

### 1.2. Start Resonate Server

Start the Resonate Server. By default, the Resonate Server will listen at `http://localhost:8001`.

```
resonate dev
```

### 1.3. Setup the Deep Research Agent

Clone the repository

```
git clone https://github.com/resonatehq-examples/example-openai-deep-research-agent-gcp-ts
cd example-openai-deep-research-agent-gcp-ts
```

Install dependencies

```
npm install
```

### 1.4. Start the Deep Research Agent

Start the Google Cloud Function. By default, the Google Cloud Function will listen at `http://localhost:8080`.

```
npm run dev
```

### 1.5. Invoke the Deep Research Agent

Start a research task

```
resonate invoke <promise-id> --func research --arg <topic> --arg <depth> --target <function-url>
```

Example

```
resonate invoke research.1 --func research --arg "What are distributed systems" --arg 1 --target http://localhost:8080
```

### 1.6. Inspect the execution

Use the `resonate tree` command to visualize the research execution.

```
resonate tree research.1
```

## 2. Deploying to GCP

This section guides you through deploying the Deep Research Agent to Google Cloud Platform using Cloud Run for the Resonate server and Cloud Functions for the research function.

### 2.1 Prerequisites

#### Resonate

Install the Resonate CLI with [Homebrew](https://docs.resonatehq.io/operate/run-server#install-with-homebrew) or download the latest release from [Github](https://github.com/resonatehq/resonate/releases).

```
brew install resonatehq/tap/resonate
```

#### OpenAI

To run this project you need an [OpenAI API Key](https://platform.openai.com).

#### Google Cloud Platform

Ensure you have a [Google Cloud Platform](https://cloud.google.com/cloud-console) account, a project, and the necessary permissions as well as the [Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install) installed and configured.

> [!WARNING]
> Google Cloud Platform offers extensive configuration options. The instructions in this guide provide a baseline setup that you will need to adapt for your specific requirements, organizational policies, or security constraints.

### 2.2 Deploy the Resonate Server to Cloud Run

Deploy the Resonate Server with its initial configuration.

**Step 1: Initial deployment**

```
gcloud run deploy resonate-server \
  --image=resonatehqio/resonate:latest \
  --region=us-central1 \
  --allow-unauthenticated \
  --timeout=300 \
  --port=8080 \
  --min-instances=1 \
  --max-instances=1 \
  --args="serve,--api-http-addr=:8080"
```

**Step 2: Configuration**

Configure the Resonate Server with its URL.

```
export RESONATE_URL=$(gcloud run services describe resonate-server --region=us-central1 --format='value(status.url)')

gcloud run services update resonate-server \
  --region=us-central1 \
  --args="serve,--api-http-addr=:8080,--system-url=$RESONATE_URL"
```

Print the Resonate Server URL

```
echo $RESONATE_URL
```

To view the Resonate Server logs

```
gcloud run services logs read resonate-server --region=us-central1 --limit=50
```

### 2.3 Deploy the Deep Research Agent to Cloud Functions

Deploy the research function to Cloud Functions.

```
gcloud functions deploy research \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=. \
  --entry-point=handler \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars OPENAI_API_KEY=sk-...
```

Get the function URL:

```
export FUNCTION_URL=$(gcloud functions describe research --gen2 --region=us-central1 --format='value(serviceConfig.uri)')
```

Print the Cloud Function URL

```
echo $FUNCTION_URL
```

To view the Cloud Function logs

```
gcloud functions logs read research --gen2 --region=us-central1 --limit=50
```

### 2.4 Invoke the Deep Research Agent

Start a research task

```
resonate invoke <promise-id> --func research --arg <topic> --arg <depth> --target $FUNCTION_URL --server $RESONATE_URL
```

Example

```
resonate invoke research.1 --func research --arg "What are distributed systems" --arg 1 --target $FUNCTION_URL --server $RESONATE_URL
```

### 2.5. Inspect the execution

Use the `resonate tree` command to visualize the research execution.

```
resonate tree research.1 --server $RESONATE_URL
```

### 2.6 Cleanup

Delete the deployed services:

```
# Delete the Cloud Function
gcloud functions delete research --gen2 --region=us-central1 --quiet

# Delete the Cloud Run service
gcloud run services delete resonate-server --region=us-central1 --quiet
```

## Troubleshooting

The Deep Research Agent depends on OpenAI and the OpenAI TypeScript and JavaScript SDK. If you are having trouble, verify that your OpenAI credentials are configured correctly and the model is accessible by running the following command in the project's directory:

```
node -e "import OpenAI from 'openai'; const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); (async () => { const res = await client.chat.completions.create({ model: 'gpt-5', messages: [{ role: 'user', content: 'knock knock' }] }); console.log(res.choices[0].message); })();"
```

If everything is configured correctly, you will see a response from OpenAI such as:

```
{ role: 'assistant', content: "Who's there?", refusal: null, annotations: []}
```

If you are still having trouble, please [open an issue](https://github.com/resonatehq-examples/example-openai-deep-research-agent-gcp-ts/issues).
