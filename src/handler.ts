const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { randomBytes } = require("crypto");

const client = new DynamoDBClient({});

// Headers CORS completos
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token, X-Amz-User-Agent',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400'
};

exports.handler = async (event: any) => {
  console.log("🔍 Event received:", JSON.stringify(event));
  
  // Manejar preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    console.log("🔄 Handling OPTIONS preflight");
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  try {
    const body = JSON.parse(event.body || "{}");
    console.log("📝 Parsed body:", body);

    if (!body.url) {
      console.log("❌ URL is missing");
      return {
        statusCode: 400,
        headers: {
           headers: corsHeaders,
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
    } catch (urlError: any) {
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
          shortUrl: { S: shortUrl }, // Guardar también la URL corta
          createdAt: { S: new Date().toISOString() }
        }
      })
    );

    return {
      statusCode: 200,
      headers: {
         headers: corsHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shortUrl: shortUrl,
        originalUrl: originalUrl,
        code: code
      })
    };
  } catch (error: any) {
    console.error("💥 Error:", error);
    return {
      statusCode: 500,
      headers: {
         headers: corsHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: "Internal server error",
        details: error.message 
      })
    };
  }
};