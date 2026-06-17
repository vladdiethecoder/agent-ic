#!/usr/bin/env python3
"""Render a static outro card PNG with title, lines, and an optional QR code."""
import argparse
from PIL import Image, ImageDraw, ImageFont

BG = (11, 13, 16)
WHITE = (255, 255, 255)
GRAY = (156, 163, 175)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--title', required=True)
    parser.add_argument('--line', action='append', default=[])
    parser.add_argument('--qr', default=None)
    parser.add_argument('--width', type=int, default=1920)
    parser.add_argument('--height', type=int, default=1080)
    parser.add_argument('--font-bold', default='/usr/share/fonts/rsms-inter-fonts/Inter-Bold.ttf')
    parser.add_argument('--font-regular', default='/usr/share/fonts/rsms-inter-fonts/Inter-Regular.ttf')
    args = parser.parse_args()

    img = Image.new('RGB', (args.width, args.height), BG)
    draw = ImageDraw.Draw(img)

    title_font = ImageFont.truetype(args.font_bold, 84)
    line_font = ImageFont.truetype(args.font_regular, 40)

    # Title, left aligned at x=240, vertically centered slightly above middle.
    title_bbox = draw.textbbox((0, 0), args.title, font=title_font)
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]
    title_x = 240
    title_y = (args.height - title_h) // 2 - 90
    draw.text((title_x, title_y), args.title, font=title_font, fill=WHITE)

    # Lines stacked below title.
    start_y = title_y + title_h + 50
    for i, line in enumerate(args.line):
        y = start_y + i * 58
        draw.text((title_x, y), line, font=line_font, fill=GRAY)

    # QR code on the right, vertically centered.
    if args.qr:
        qr = Image.open(args.qr).convert('RGBA')
        qr_size = 320
        qr = qr.resize((qr_size, qr_size), Image.LANCZOS)
        qr_x = args.width - qr_size - 240
        qr_y = (args.height - qr_size) // 2 - 50
        img.paste(qr, (qr_x, qr_y), qr)

    img.save(args.output, 'PNG')


if __name__ == '__main__':
    main()
