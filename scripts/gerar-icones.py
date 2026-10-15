#!/usr/bin/env python3
"""
Gera os ícones PNG do PWA a partir do mesmo desenho de public/icone.svg
(dois anéis entrelaçados sobre o verde escuro).

Sem dependências: o PNG é montado com zlib e struct da biblioteca padrão.

    python scripts/gerar-icones.py
"""

import struct
import zlib
from pathlib import Path

SAIDA = Path(__file__).resolve().parent.parent / "public"
FUNDO = (0x14, 0x53, 0x2D)
ANEL_1 = (0xFF, 0xFF, 0xFF)
ANEL_2 = (0x4A, 0xDE, 0x80)
AMOSTRAS = 3  # supersampling 3x3 para bordas suaves


def cor_no_ponto(x: float, y: float, escala: float, cantos: bool) -> tuple[int, int, int, int]:
    """Coordenadas no espaço 0..64 do SVG; escala < 1 encolhe o símbolo (zona segura do maskable)."""
    if cantos:
        r = 16
        cx = min(max(x, r), 64 - r)
        cy = min(max(y, r), 64 - r)
        if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
            return (0, 0, 0, 0)
    sx = 32 + (x - 32) / escala
    sy = 32 + (y - 32) / escala
    for (cx, cy, cor) in ((39, 32, ANEL_2), (25, 32, ANEL_1)):
        d = ((sx - cx) ** 2 + (sy - cy) ** 2) ** 0.5
        if abs(d - 13) <= 2.5:
            return (*cor, 255)
    return (*FUNDO, 255)


def png(tamanho: int, escala: float = 1.0, cantos: bool = True) -> bytes:
    linhas = bytearray()
    passo = 64 / tamanho
    for py in range(tamanho):
        linhas.append(0)
        for px in range(tamanho):
            soma = [0, 0, 0, 0]
            for sy in range(AMOSTRAS):
                for sx in range(AMOSTRAS):
                    x = (px + (sx + 0.5) / AMOSTRAS) * passo
                    y = (py + (sy + 0.5) / AMOSTRAS) * passo
                    c = cor_no_ponto(x, y, escala, cantos)
                    for i in range(4):
                        soma[i] += c[i]
            n = AMOSTRAS * AMOSTRAS
            linhas.extend(round(v / n) for v in soma)

    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", tamanho, tamanho, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", ihdr) + bloco(b"IDAT", zlib.compress(bytes(linhas), 9)) + bloco(b"IEND", b"")


def main() -> None:
    SAIDA.mkdir(exist_ok=True)
    alvos = {
        "icone-192.png": png(192),
        "icone-512.png": png(512),
        # Maskable: fundo até a borda e símbolo dentro da zona segura (80%).
        "icone-maskable-512.png": png(512, escala=0.72, cantos=False),
        "apple-touch-icon.png": png(180, cantos=False),
    }
    for nome, dados in alvos.items():
        (SAIDA / nome).write_bytes(dados)
        print(f"{nome}: {len(dados)} bytes")


if __name__ == "__main__":
    main()
