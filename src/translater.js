const axios = require('axios');
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

const MODEL = "openai/gpt-4o";

async function translateToPortuguese(fileContent) {
  try {
    console.log('Iniciando tradução para português...');
    const startTime = Date.now(); // Captura o tempo de início
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "Você é um tradutor especializado em traduzir textos teológicos antigos de inglês para português brasileiro, mantendo a formatação markdown."
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
    console.log(`Iniciando processamento do arquivo: ${filePath}`);
    
    // Lê o arquivo original
    const fileContent = await fs.readFile(filePath, 'utf-8');
    console.log(`Arquivo lido com sucesso: ${fileContent.length} caracteres`);
    
    // Traduz o conteúdo
    const translatedContent = await translateToPortuguese(fileContent);
    
    // Salva o conteúdo traduzido no mesmo arquivo
    await fs.writeFile(filePath, translatedContent);
    
    console.log(`Arquivo traduzido e salvo em: ${filePath}`);
  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
  }
}

async function processDirectory(dirPath) {
  try {
    console.log(`Processando diretório: ${dirPath}`);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const processingPromises = []; // Array para armazenar as promessas de processamento

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        console.log(`Encontrado diretório: ${fullPath}. Processando recursivamente...`);
        // Processa recursivamente os subdiretórios
        await processDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        console.log(`Encontrado arquivo .md: ${fullPath}. Adicionando à lista de processamento...`);
        // Adiciona a promessa de processamento do arquivo ao array
        processingPromises.push(processFile(fullPath));
      }
    }

    // Aguarda a conclusão de todas as promessas de processamento
    await Promise.all(processingPromises);
    console.log(`Processamento do diretório ${dirPath} concluído.`);
  } catch (error) {
    console.error(`Erro ao processar diretório ${dirPath}:`, error);
  }
}

// Executa com base nos argumentos da linha de comando
if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Por favor, forneça o caminho do arquivo ou diretório a ser traduzido');
    process.exit(1);
  }

  (async () => {
    try {
      const stats = await fs.stat(inputPath);
      if (stats.isDirectory()) {
        console.log(`Iniciando processamento do diretório: ${inputPath}`);
        await processDirectory(inputPath);
      } else if (stats.isFile() && inputPath.endsWith('.md')) {
        console.log(`Iniciando processamento do arquivo: ${inputPath}`);
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

module.exports = { translateToPortuguese, processFile, processDirectory };
