#!/usr/bin/env python3
"""
税理士事務所 スクレイピングスクリプト
近畿税理士会 会員検索 から事務所情報・メアドを収集
対象: https://www.kinki-zeirishikai.or.jp/
"""

import requests
from bs4 import BeautifulSoup
import csv
import time
import re
import sys
import argparse
from urllib.parse import urljoin, urlencode

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

def scrape_taxaccountant_jp(max_count=300):
    """
    日本税理士会連合会 税理士検索
    https://www.tax.or.jp/membership/search.jsp
    """
    BASE = 'https://www.tax.or.jp/membership/search.jsp'
    results = []

    prefectures = [
        ('大阪', '27'), ('兵庫', '28'), ('京都', '26'), ('奈良', '29'),
        ('滋賀', '25'), ('和歌山', '30'),
    ]

    for pref_name, pref_code in prefectures:
        if len(results) >= max_count:
            break
        print(f'\n[{pref_name}] 検索中...', flush=True)

        page = 1
        while len(results) < max_count:
            params = {
                'pref': pref_code,
                'page': page,
            }
            r = fetch(BASE, params=params)
            if not r:
                break

            soup = BeautifulSoup(r.text, 'html.parser')

            # 事務所リストを取得（サイト構造に応じて調整）
            rows = soup.select('table tr, .search-result-item, .member-item')
            if not rows:
                break

            found = 0
            for row in rows:
                text = row.get_text()
                email = extract_email(text)

                # 事務所名取得
                office = ''
                for sel in ['.office-name', '.name', 'td:nth-child(2)', 'h3', 'h4']:
                    el = row.select_one(sel)
                    if el:
                        office = el.get_text(strip=True)
                        break

                if not office:
                    continue

                # HP URL取得
                hp_url = ''
                for a in row.find_all('a', href=re.compile(r'^https?://')):
                    href = a['href']
                    if 'tax.or.jp' not in href:
                        hp_url = href
                        break

                # 電話番号
                phones = re.findall(r'0\d{1,4}[-−]\d{1,4}[-−]\d{4}', text)
                phone = phones[0] if phones else ''

                # 住所
                address = ''
                for sel in ['.address', 'td:nth-child(3)']:
                    el = row.select_one(sel)
                    if el:
                        address = el.get_text(strip=True)
                        break

                results.append({
                    'office': office,
                    'email': email,
                    'phone': phone,
                    'address': address,
                    'notes': hp_url,
                })
                found += 1
                status = f'メール:{email[:30] if email else "なし":30s}'
                print(f'  {office[:25]:25s} → {status}', flush=True)

                if len(results) >= max_count:
                    break

            if found == 0:
                break

            # 次ページ確認
            next_btn = soup.select_one('a.next, a[rel=next], .pagination .next a')
            if not next_btn:
                break
            page += 1
            time.sleep(1.0)

    return results


def scrape_osaka_zeirishi(max_count=300):
    """
    大阪府税理士会 会員検索
    https://www.osaka-zeirishikai.or.jp/
    """
    BASE = 'https://www.osaka-zeirishikai.or.jp/member/search/'
    results = []
    page = 1

    print('\n[大阪府税理士会] 検索中...', flush=True)

    while len(results) < max_count:
        params = {'page': page}
        r = fetch(BASE, params=params)
        if not r:
            break

        soup = BeautifulSoup(r.text, 'html.parser')
        items = soup.select('.member-list li, .search-result li, table tbody tr')

        if not items:
            break

        found = 0
        for item in items:
            text = item.get_text()
            email = extract_email(text)

            office = ''
            for sel in ['.name', 'td:first-child', 'strong', 'h3']:
                el = item.select_one(sel)
                if el:
                    office = el.get_text(strip=True)
                    break
            if not office:
                continue

            hp_url = ''
            for a in item.find_all('a', href=re.compile(r'^https?://')):
                if 'osaka-zeirishikai' not in a['href']:
                    hp_url = a['href']
                    break

            phones = re.findall(r'0\d{1,4}[-−]\d{1,4}[-−]\d{4}', text)
            results.append({
                'office': office,
                'email': email,
                'phone': phones[0] if phones else '',
                'address': '',
                'notes': hp_url,
            })
            found += 1
            print(f'  {office[:25]:25s} → メール:{email if email else "なし"}', flush=True)

            if len(results) >= max_count:
                break

        if found == 0:
            break

        next_btn = soup.select_one('a.next, .pagination .next a')
        if not next_btn:
            break
        page += 1
        time.sleep(1.0)

    return results


def scrape_by_google_maps(keyword='税理士事務所', area='大阪', max_count=100):
    """
    Google検索から税理士事務所のHPを見つけてメアドを収集するシンプル版
    """
    print(f'\n[Google検索経由] {area} {keyword} 収集中...', flush=True)
    results = []

    # シンプルなDuckDuckGo HTML検索
    for page_start in range(0, max_count, 10):
        if len(results) >= max_count:
            break

        search_url = 'https://html.duckduckgo.com/html/'
        params = {'q': f'{area} {keyword} メール', 's': str(page_start)}
        r = fetch(search_url, params=params)
        if not r:
            break

        soup = BeautifulSoup(r.text, 'html.parser')
        links = soup.select('.result__a')

        for link in links:
            if len(results) >= max_count:
                break
            href = link.get('href', '')
            title = link.get_text(strip=True)
            if not href.startswith('http'):
                continue

            # HPにアクセスしてメアドを探す
            site = fetch(href, timeout=8)
            if not site:
                continue

            site_soup = BeautifulSoup(site.text, 'html.parser')
            email = extract_email(site.text)

            phones = re.findall(r'0\d{1,4}[-−]\d{1,4}[-−]\d{4}', site.text)

            results.append({
                'office': title,
                'email': email,
                'phone': phones[0] if phones else '',
                'address': area,
                'notes': href,
            })
            print(f'  {title[:25]:25s} → メール:{email if email else "なし"}', flush=True)
            time.sleep(1.5)

        time.sleep(2.0)

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
    parser.add_argument('--mode', choices=['osaka', 'kinki', 'google'], default='google',
                        help='収集モード: osaka=大阪府税理士会, kinki=近畿税理士会, google=Google経由（デフォルト）')
    parser.add_argument('--area', default='大阪', help='対象エリア（googleモード時）')
    parser.add_argument('--max', type=int, default=100, help='最大件数（デフォルト100）')
    parser.add_argument('--output', default=OUTPUT_FILE, help='出力CSVパス')
    args = parser.parse_args()

    print('=== 税理士事務所 リスト収集ツール ===')
    print(f'モード: {args.mode} / 最大: {args.max}件 / 出力: {args.output}\n')

    if args.mode == 'osaka':
        results = scrape_osaka_zeirishi(args.max)
    elif args.mode == 'kinki':
        results = scrape_taxaccountant_jp(args.max)
    else:
        results = scrape_by_google_maps(area=args.area, max_count=args.max)

    if not results:
        print('結果が0件でした。対象サイトの構造が変わっている可能性があります。')
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
