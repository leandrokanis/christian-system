const axios = require('axios');
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

const MODEL = "openai/gpt-4o-mini";

async function translateToPortuguese(fileContent) {
  try {
    console.log('Iniciando tradução para português...');
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "Você é um tradutor especializado em traduzir textos teológicos antigosde inglês para português brasileiro, mantendo a formatação markdown."
          },
          {
            role: "system",
            content: "Mantenha todos os elementos de formatação markdown (títulos, negrito, itálico, listas, etc) exatamente como estão no texto original."
          },
          {
            role: "system",
            content: "Quando houver citação bíblica, use a versão NVI (Nova Versão Internacional)."
          },
          {
            role: "system",
            content: "Traduza o texto para uma linguagem contemporânea, com palavras e expressões atuais brasileiras."
          },
          {
            role: "user",
            content: `Por favor, traduza o seguinte texto de inglês para português brasileiro, mantendo a formatação markdown:\n\n${fileContent}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Text Translator'
        }
      }
    );

    if (!response.data || !response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
      console.error('Resposta da API em formato inesperado:', JSON.stringify(response.data, null, 2));
      throw new Error('Resposta da API em formato inválido');
    }

    console.log('Tradução concluída com sucesso');
    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.response) {
      console.error('Erro da API:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    console.error('Erro ao traduzir texto:', error.message);
    throw error;
  }
}

async function processFile(filePath) {
  try {
    // Lê o arquivo original
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    // Traduz o conteúdo
    const translatedContent = await translateToPortuguese(fileContent);
    
    // Cria o nome do novo arquivo
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath, '.md');
    const modelName = MODEL.replace('/', '-').toLowerCase();
    const newFilePath = path.join(dir, `${basename}.pt-br.${modelName}.md`);
    
    // Salva o conteúdo traduzido no novo arquivo
    await fs.writeFile(newFilePath, translatedContent);
    
    console.log(`Arquivo traduzido salvo em: ${newFilePath}`);
  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
  }
}

// Executa com base nos argumentos da linha de comando
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Por favor, forneça o caminho do arquivo a ser traduzido');
    process.exit(1);
  }
  processFile(filePath);
}

module.exports = { translateToPortuguese, processFile };
