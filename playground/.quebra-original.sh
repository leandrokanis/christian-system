#!/bin/bash

# Nome do arquivo grande
input_file="original.md"

# Separador de subtítulo
subtitle_separator="Part"

# Variável para armazenar o nome do arquivo atual
output_file=""

# Função para converter números romanos para decimais
roman_to_decimal() {
    local roman="$1"
    local result=0
    local prev_char=""
    for ((i = 0; i < ${#roman}; i++)); do
        local char="${roman:i:1}"
        case $char in
            I) result=$((result + 1));;
            V) result=$((result + 5));;
            X) result=$((result + 10));;
            L) result=$((result + 50));;
            C) result=$((result + 100));;
            D) result=$((result + 500));;
            M) result=$((result + 1000));;
        esac
        if [[ ("$char" == "V" || "$char" == "X") && "$prev_char" == "I" ]]; then
            result=$((result - 2))
        elif [[ ("$char" == "L" || "$char" == "C") && "$prev_char" == "X" ]]; then
            result=$((result - 20))
        elif [[ ("$char" == "D" || "$char" == "M") && "$prev_char" == "C" ]]; then
            result=$((result - 200))
        fi
        prev_char="$char"
    done
    echo "$result"
}

# Ler o arquivo grande linha por linha
while IFS= read -r line; do
    # Verificar se a linha contém um novo subtítulo
    if [[ $line == *"$subtitle_separator"* ]]; then
        # Extrair o número do subtítulo romano
        subtitle_roman=$(echo "$line" | grep -oE 'Part [IVXLCDM]+')

        # Converter o número romano para decimal
        subtitle_number=$(roman_to_decimal "$subtitle_roman")

        # Nome do novo arquivo
        output_file="part_$subtitle_number.md"

        # Iniciar um novo arquivo com o subtítulo atual
        echo "$line" > "$output_file"
    elif [ ! -z "$output_file" ]; then
        # Continuar escrevendo no arquivo atual se ele estiver aberto
        echo "$line" >> "$output_file"
    fi
done < "$input_file"
