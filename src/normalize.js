const axios = require('axios');
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

const MODEL = "openai/gpt-4o-mini";

async function normalizeToModernEnglish(fileContent) {
  try {
    console.log('Iniciando normalização para inglês moderno...');
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "Você é um assistente especializado em atualizar textos antigos de inglês arcaico para inglês moderno."
          },
          {
            role: "system",
            content: "Mantenha todos os elementos de formatação markdown (títulos, negrito, itálico, listas, etc) exatamente como estão no texto original."
          },
          { 
            role: "user",
            content: `Por favor, atualize o seguinte texto de inglês arcaico para inglês moderno:\n\n${fileContent}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Text Normalizer'
        }
      }
    );

    if (!response.data || !response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
      console.error('Resposta da API em formato inesperado:', JSON.stringify(response.data, null, 2));
      throw new Error('Resposta da API em formato inválido');
    }

    console.log('Normalização concluída com sucesso');
    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.response) {
      console.error('Erro da API:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    console.error('Erro ao normalizar texto:', error.message);
    throw error;
  }
}

async function processFile(filePath) {
  try {
    console.log(`Iniciando processamento do arquivo: ${filePath}`);
    
    // Lê o arquivo original
    console.log('Lendo arquivo de entrada...');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    console.log(`Arquivo lido com sucesso: ${fileContent.length} caracteres`);
    
    // Normaliza o conteúdo
    const normalizedContent = await normalizeToModernEnglish(fileContent);
    
    // Salva o conteúdo normalizado no mesmo arquivo
    await fs.writeFile(filePath, normalizedContent);
    
    console.log(`Arquivo normalizado salvo em: ${filePath}`);
  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
  }
}

async function processDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Processa recursivamente os subdiretórios
        await processDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Processa apenas arquivos .md
        await processFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Erro ao processar diretório ${dirPath}:`, error);
  }
}

// Executa com base nos argumentos da linha de comando
if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Por favor, forneça o caminho do arquivo ou diretório a ser normalizado');
    process.exit(1);
  }

  (async () => {
    try {
      const stats = await fs.stat(inputPath);
      if (stats.isDirectory()) {
        await processDirectory(inputPath);
      } else if (stats.isFile() && inputPath.endsWith('.md')) {
        await processFile(inputPath);
      } else {
        console.error('O caminho fornecido não é um arquivo .md ou um diretório.');
        process.exit(1);
      }
    } catch (error) {
      console.error('Erro ao processar entrada:', error);
      process.exit(1);
    }
  })();
}

module.exports = { normalizeToModernEnglish, processFile, processDirectory };
