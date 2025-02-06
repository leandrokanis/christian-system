const axios = require('axios');
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

const MODEL = "openai/gpt-4o-mini";

async function createGlossary(fileContent) {
  try {
    console.log('Criando glossário de palavras...');
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: MODEL,
        "messages": [
          {
            "role": "system",
            "content": "Você é um assistente especializado em análise linguística de textos do século XIX, focado em identificar palavras arcaicas, que não são mais usadas atualmente, ou que tenham significados diferentes do que o moderno."
          },
          {
            "role": "system",
            "content": "Sua tarefa é extrair palavras arcaicas diretamente do texto fornecido, sem inventar ou adicionar palavras que não estejam presentes nele."
          },
          {
            "role": "system",
            "content": "Para cada palavra arcaica identificada, forneça a saída em json com o seguinte formato: `{\"term\": \"palavra arcaica\", \"explanation\": \"explicação da palavra em inglês\", \"modern_equivalent\": \"equivalente moderno em inglês\"}`"
          },
          {
            "role": "system",
            "content": "Responda apenas com um JSON contendo uma lista de palavras arcaicas encontradas. Se nenhuma palavra arcaica relevante for identificado, retorne um JSON vazio: `[]`."
          },
          {
            "role": "user",
            "content": `Analise o seguinte texto e identifique palavras arcaicas que possam ser problemáticas na tradução:\n\n${fileContent}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
        }
      }
    );

    const rawContent = response.data.choices[0].message.content;
    const jsonString = rawContent.replace(/```json\n|\n```/g, '').trim();

    // Verifica se o conteúdo é vazio
    if (jsonString === '') {
      console.warn('Nenhuma palavra encontrada. Retornando um glossário vazio.');
      return [];
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Erro ao fazer parse do glossário:', jsonString);
      throw parseError;
    }

    console.log('Glossário de palavras concluído com sucesso');
    return parsedContent;
  } catch (error) {
    console.error('Erro ao criar glossário:', error);
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
    
    // Gera o novo glossário
    console.log('Gerando novo glossário...');
    const newGlossary = await createGlossary(fileContent);
    console.log('Novo glossário gerado com sucesso');

    // Adiciona verificação e tratamento do JSON
    let newTerms;
    try {
      console.log('########################');
      console.log({newGlossary});
      console.log('########################');

      newTerms = newGlossary;
      if (!Array.isArray(newTerms)) {
        console.error('O glossário não é um array:', newGlossary);
        throw new Error('O formato do glossário é inválido - esperava um array');
      }
    } catch (parseError) {
      console.error('Erro ao fazer parse do glossário:', newGlossary);
      console.error('Erro detalhado:', parseError);
      throw parseError;
    }

    console.log(`Número de novos termos encontrados: ${newTerms.length}`);
    
    // Define o caminho do arquivo de glossário
    const glossaryPath = 'glossary.json';
    console.log(`Caminho do arquivo de glossário: ${glossaryPath}`);
    
    // Verifica se o arquivo de glossário já existe
    let existingGlossary = [];
    try {
      console.log('Verificando glossário existente...');
      const existingContent = await fs.readFile(glossaryPath, 'utf-8');
      existingGlossary = JSON.parse(existingContent);
      console.log(`Glossário existente encontrado com ${existingGlossary.length} termos`);
    } catch (error) {
      console.log('Nenhum glossário existente encontrado, iniciando novo glossário');
    }

    // Combina o glossário existente com os novos termos
    console.log('Processando novos termos...');
    const combinedGlossary = [...existingGlossary];

    // Adiciona apenas termos que ainda não existem no glossário
    let termosAdicionados = 0;
    for (const newTerm of newTerms) {
      const termExists = combinedGlossary.some(
        existing => existing.term.toLowerCase() === newTerm.term.toLowerCase()
      );
      if (!termExists) {
        combinedGlossary.push(newTerm);
        termosAdicionados++;
      }
    }
    console.log(`${termosAdicionados} novos termos adicionados ao glossário`);
    
    // Salva o glossário combinado
    console.log('Salvando glossário atualizado...');
    await fs.writeFile(glossaryPath, JSON.stringify(combinedGlossary, null, 2));
    console.log(`Glossário atualizado com sucesso. Total de termos: ${combinedGlossary.length}`);
    
  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
    console.error('Detalhes do erro:', error.stack);
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

// Modifica a execução principal
if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Por favor, forneça o caminho do arquivo ou diretório a ser processado');
    process.exit(1);
  }

  (async () => {
    try {
      const stats = await fs.stat(inputPath);
      if (stats.isDirectory()) {
        await processDirectory(inputPath);
      } else {
        await processFile(inputPath);
      }
    } catch (error) {
      console.error('Erro ao processar entrada:', error);
      process.exit(1);
    }
  })();
}

module.exports = { createGlossary, processFile, processDirectory };
