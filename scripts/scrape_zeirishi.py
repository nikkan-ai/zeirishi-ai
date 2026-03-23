#!/usr/bin/env python3
"""
税理士事務所 スクレイピングスクリプト
iタウンページから税理士事務所のHP・メアドを収集
"""

import requests
from bs4 import BeautifulSoup
import csv
import time
import re
import sys
import argparse

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

OUTPUT_FILE = 'scripts/zeirishi_leads.csv'

def fetch(url, params=None, timeout=10):
    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=timeout)
        r.encoding = r.apparent_encoding
        return r
    except Exception as e:
        print(f'  [失敗] {url}: {e}', file=sys.stderr)
        return None

def extract_email(text):
    emails = re.findall(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', text)
    emails = [e for e in emails if not re.search(r'\.(png|jpg|gif|svg)$', e, re.I)]
    emails = [e for e in emails if 'example' not in e and 'sample' not in e]
    return emails[0] if emails else ''

def scrape_itp(area='大阪府', max_count=200):
    """iタウンページから税理士事務所リストを収集"""
    results = []
    page = 1

    area_code = {
        '大阪府': 'osaka', '兵庫県': 'hyogo', '京都府': 'kyoto',
        '奈良県': 'nara', '滋賀県': 'shiga', '和歌山県': 'wakayama',
    }.get(area, 'osaka')

    print(f'[iタウンページ] {area} 税理士事務所 収集中...', flush=True)

    while len(results) < max_count:
        url = f'https://itp.ne.jp/search/result/'
        params = {
            'kw': '税理士事務所',
            'ar': area_code,
            'pg': page,
        }
        r = fetch(url, params=params)
        if not r:
            break

        soup = BeautifulSoup(r.text, 'html.parser')

        # 各事務所エントリを取得
        items = soup.select('.shopList_item, .shop-item, article.result-item, .resultItem')
        if not items:
            # 別のセレクタを試す
            items = soup.select('li[class*="shop"], div[class*="shop"], div[class*="result"]')
        if not items:
            print(f'  ページ{page}: 結果が取得できませんでした', flush=True)
            break

        found = 0
        for item in items:
            text = item.get_text()

            # 事務所名
            office = ''
            for sel in ['.shopName', '.shop-name', 'h2', 'h3', '.name', 'a[class*="name"]']:
                el = item.select_one(sel)
                if el:
                    office = el.get_text(strip=True)
                    break
            if not office:
                continue

            # 電話番号
            phones = re.findall(r'0\d{1,4}[-−ー]\d{1,4}[-−ー]\d{3,4}', text)
            phone = phones[0] if phones else ''

            # 住所
            address = ''
            for sel in ['.address', '.addr', '[class*="address"]']:
                el = item.select_one(sel)
                if el:
                    address = el.get_text(strip=True)
                    break

            # HP URL（詳細ページリンク）
            hp_url = ''
            for a in item.find_all('a', href=re.compile(r'^https?://')):
                href = a['href']
                if 'itp.ne.jp' not in href:
                    hp_url = href
                    break

            # 詳細ページからメアド取得
            detail_link = item.select_one('a[href*="/detail/"]')
            email = ''
            if detail_link:
                detail_url = 'https://itp.ne.jp' + detail_link['href'] if detail_link['href'].startswith('/') else detail_link['href']
                dr = fetch(detail_url, timeout=8)
                if dr:
                    email = extract_email(dr.text)
                    if not hp_url:
                        dsoup = BeautifulSoup(dr.text, 'html.parser')
                        for a in dsoup.find_all('a', href=re.compile(r'^https?://')):
                            href = a['href']
                            if 'itp.ne.jp' not in href and 'google' not in href:
                                hp_url = href
                                break
                time.sleep(0.5)

            results.append({
                'office': office,
                'email': email,
                'phone': phone,
                'address': address,
                'notes': hp_url,
            })
            found += 1
            status = email if email else 'メールなし'
            print(f'  [{len(results):3d}] {office[:25]:25s} → {status}', flush=True)

            if len(results) >= max_count:
                break

        if found == 0:
            break

        # 次ページ
        next_btn = soup.select_one('a.next, .pagination .next a, a[rel="next"]')
        if not next_btn:
            break
        page += 1
        time.sleep(1.5)

    return results


def scrape_taxoffice_jp(area='大阪', max_count=200):
    """
    税理士ドットコム・Googleマップ経由でメアドを収集
    """
    results = []
    print(f'\n[税理士.jp経由] {area} 収集中...', flush=True)

    for page in range(1, 20):
        if len(results) >= max_count:
            break

        url = f'https://www.zeiri4.com/c_2/search/'
        params = {'address': area, 'page': page}
        r = fetch(url, params=params)
        if not r:
            break

        soup = BeautifulSoup(r.text, 'html.parser')
        items = soup.select('.expert-card, .counselor-item, .search-result-item, article')

        if not items:
            break

        found = 0
        for item in items:
            text = item.get_text()

            office = ''
            for sel in ['h2', 'h3', '.name', '.office-name', 'strong']:
                el = item.select_one(sel)
                if el:
                    office = el.get_text(strip=True)
                    if office:
                        break
            if not office:
                continue

            email = extract_email(text)
            phones = re.findall(r'0\d{1,4}[-−]\d{1,4}[-−]\d{3,4}', text)

            hp_url = ''
            for a in item.find_all('a', href=re.compile(r'^https?://')):
                if 'zeiri4.com' not in a['href']:
                    hp_url = a['href']
                    break

            results.append({
                'office': office,
                'email': email,
                'phone': phones[0] if phones else '',
                'address': area,
                'notes': hp_url,
            })
            found += 1
            print(f'  [{len(results):3d}] {office[:25]:25s} → {email if email else "メールなし"}', flush=True)

            if len(results) >= max_count:
                break

        if found == 0:
            break
        time.sleep(1.0)

    return results


def scrape_from_hp(offices_csv=None, max_count=100):
    """
    既存CSVのHP URLからメアドを直接収集
    offices_csv: office,notes(HP URL) の入ったCSV
    """
    if not offices_csv:
        print('HP URLのCSVが必要です。', file=sys.stderr)
        return []

    import csv as csv_mod
    results = []
    with open(offices_csv, encoding='utf-8-sig') as f:
        reader = csv_mod.DictReader(f)
        rows = list(reader)

    print(f'\n[HP直接アクセス] {len(rows)}件のHPからメアド収集中...', flush=True)

    for i, row in enumerate(rows[:max_count]):
        hp_url = row.get('notes', '') or row.get('HP URL', '')
        office = row.get('office', '')
        if not hp_url or not hp_url.startswith('http'):
            continue

        r = fetch(hp_url, timeout=8)
        if not r:
            continue

        email = extract_email(r.text)
        result = dict(row)
        result['email'] = email
        results.append(result)
        print(f'  [{i+1:3d}] {office[:25]:25s} → {email if email else "メールなし"}', flush=True)
        time.sleep(1.0)

    return results


def save_csv(results, output_file):
    with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['office', 'email', 'phone', 'address', 'notes'])
        writer.writeheader()
        for r in results:
            writer.writerow({
                'office': r.get('office', ''),
                'email': r.get('email', ''),
                'phone': r.get('phone', ''),
                'address': r.get('address', ''),
                'notes': r.get('notes', ''),
            })


def main():
    parser = argparse.ArgumentParser(description='税理士事務所メアド収集ツール')
    parser.add_argument('--mode', choices=['itp', 'zeiri', 'hp'], default='itp',
                        help='収集モード: itp=iタウンページ（デフォルト）, zeiri=税理士.jp, hp=HP直接アクセス')
    parser.add_argument('--area', default='大阪府', help='対象エリア（例: 大阪府・兵庫県）')
    parser.add_argument('--max', type=int, default=100, help='最大件数（デフォルト100）')
    parser.add_argument('--output', default=OUTPUT_FILE, help='出力CSVパス')
    parser.add_argument('--input', help='入力CSVパス（hpモード時）')
    args = parser.parse_args()

    print('=== 税理士事務所 リスト収集ツール ===')
    print(f'モード: {args.mode} / エリア: {args.area} / 最大: {args.max}件 / 出力: {args.output}\n')

    if args.mode == 'itp':
        results = scrape_itp(area=args.area, max_count=args.max)
    elif args.mode == 'zeiri':
        results = scrape_taxoffice_jp(area=args.area, max_count=args.max)
    elif args.mode == 'hp':
        results = scrape_from_hp(offices_csv=args.input, max_count=args.max)
    else:
        results = []

    if not results:
        print('\n結果が0件でした。')
        print('対象サイトの構造が変わっている可能性があります。')
        print('管理画面からCSVを手動でアップロードすることも可能です。')
        return

    save_csv(results, args.output)

    email_count = sum(1 for r in results if r.get('email'))
    hp_count = sum(1 for r in results if r.get('notes'))
    print(f'\n=== 完了 ===')
    print(f'取得件数: {len(results)}件')
    print(f'メアドあり: {email_count}件 ({email_count*100//len(results) if results else 0}%)')
    print(f'HP URLあり: {hp_count}件 ({hp_count*100//len(results) if results else 0}%)')
    print(f'出力: {args.output}')


if __name__ == '__main__':
    main()
