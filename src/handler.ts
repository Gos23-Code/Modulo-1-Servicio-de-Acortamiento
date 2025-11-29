import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { randomBytes } from "crypto";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const client = new DynamoDBClient({});

// Headers CORS completos
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent',
  'Access-Control-Allow-Credentials': 'false',
  'Access-Control-Max-Age': '86400'
};

interface RequestBody {
  url: string;
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log("🔍 Event received:", JSON.stringify(event));
  
  // En HTTP API v2, el método está aquí
  const httpMethod = event.requestContext?.http?.method;
  console.log("📌 HTTP Method:", httpMethod);
  
  // Manejar preflight OPTIONS request
  if (httpMethod === 'OPTIONS') {
    console.log("🔄 Handling OPTIONS preflight");
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  try {
    const body: RequestBody = JSON.parse(event.body || "{}");
    console.log("📝 Parsed body:", body);
    
    if (!body.url) {
      console.log("❌ URL is missing");
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: "url is required" })
      };
    }
    
    // Generar código corto (6 caracteres hexadecimales)
    const code = randomBytes(3).toString("hex");
    console.log("🔑 Generated code:", code);
    
    // Extraer el dominio base de la URL original
    const originalUrl = body.url;
    let shortUrl: string;
    
    try {
      const urlObj = new URL(originalUrl);
      // Reemplazar todo después del dominio por el código
      shortUrl = `${urlObj.protocol}//${urlObj.hostname}/${code}`;
      console.log("✅ Short URL created:", shortUrl);
    } catch (urlError) {
      console.error("❌ Invalid URL format, using default base URL");
      // Si la URL es inválida, usar BASE_URL como fallback
      shortUrl = `${process.env.BASE_URL}/${code}`;
    }
    
    // Guardar en DynamoDB
    console.log("💾 Saving to DynamoDB, table:", process.env.TABLE_NAME);
    await client.send(
      new PutItemCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
          code: { S: code },
          originalUrl: { S: originalUrl },
          shortUrl: { S: shortUrl },
          createdAt: { S: new Date().toISOString() },
          totalVisits: { N: "0" },
          visitsByDate: { M: {} }
        }
      })
    );
    
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shortUrl: shortUrl,
        originalUrl: originalUrl,
        code: code
      })
    };
    
  } catch (error) {
    console.error("💥 Error:", error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: "Internal server error",
        details: errorMessage 
      })
    };
  }
};