"""
YouTube integration using yt-dlp for searching and downloading videos.
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional

try:
    import yt_dlp
except ImportError:
    print("ERROR: yt-dlp not installed. Install with: pip install yt-dlp", file=sys.stderr)
    sys.exit(1)


def search_youtube(query: str, max_results: int = 20) -> list[dict]:
    """
    Search YouTube and return a list of video results.
    
    Args:
        query: Search query string
        max_results: Maximum number of results to return
        
    Returns:
        List of video dictionaries with id, title, uploader, duration, thumbnail
    """
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'force_generic_extractor': False,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Search YouTube
            search_results = ydl.extract_info(f"ytsearch{max_results}:{query}", download=False)
            
            if not search_results or 'entries' not in search_results:
                return []
            
            results = []
            for entry in search_results['entries']:
                if entry is None:
                    continue
                
                # Get the best thumbnail URL
                thumbnail_url = ''
                if 'thumbnail' in entry and entry['thumbnail']:
                    thumbnail_url = entry['thumbnail']
                elif 'thumbnails' in entry and entry['thumbnails']:
                    # Get the highest quality thumbnail
                    thumbnails = entry['thumbnails']
                    if isinstance(thumbnails, list) and len(thumbnails) > 0:
                        # Try to get the last one (usually highest quality)
                        thumbnail_url = thumbnails[-1].get('url', '')
                
                # Fallback: construct thumbnail URL from video ID
                if not thumbnail_url and entry.get('id'):
                    thumbnail_url = f"https://i.ytimg.com/vi/{entry['id']}/mqdefault.jpg"
                    
                results.append({
                    'id': entry.get('id', ''),
                    'title': entry.get('title', 'Unknown'),
                    'uploader': entry.get('uploader', 'Unknown'),
                    'duration': entry.get('duration', 0),
                    'thumbnail': thumbnail_url,
                    'url': entry.get('url', '') or f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                })
            
            return results
            
    except Exception as e:
        print(f"ERROR searching YouTube: {e}", file=sys.stderr)
        return []


def download_video(
    url: str,
    output_dir: str,
    audio_only: bool = False,
    format_preference: str = "best"
) -> Optional[dict]:
    """
    Download a video from YouTube.
    
    Args:
        url: YouTube URL or video ID
        output_dir: Directory to save the downloaded file
        audio_only: If True, download audio only
        format_preference: Format preference (best, bestaudio, etc.)
        
    Returns:
        Dictionary with download info (filepath, title, etc.) or None on error
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Determine output template and format
    if audio_only:
        # Download best audio and convert to m4a (better compatibility than opus)
        output_template = str(output_dir / "%(title)s.%(ext)s")
        format_str = 'bestaudio/best'
        ydl_opts = {
            'format': format_str,
            'outtmpl': output_template,
            'quiet': True,
            'no_warnings': False,
            'noprogress': True,
            'progress_hooks': [],
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'm4a',
                'preferredquality': '192',
            }],
        }
    else:
        # Download video with audio
        output_template = str(output_dir / "%(title)s.%(ext)s")
        format_str = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        ydl_opts = {
            'format': format_str,
            'outtmpl': output_template,
            'quiet': True,
            'no_warnings': False,
            'noprogress': True,
            'progress_hooks': [],
            'merge_output_format': 'mp4',
        }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Extract info first
            info = ydl.extract_info(url, download=False)
            
            if info is None:
                print(f"ERROR: Could not extract info from {url}", file=sys.stderr)
                return None
            
            # Download
            ydl.download([url])
            
            # Determine the actual filename
            if audio_only:
                # After postprocessing, extension will be m4a
                filename = ydl.prepare_filename(info)
                # Replace extension with m4a
                filename = Path(filename).with_suffix('.m4a')
            else:
                filename = Path(ydl.prepare_filename(info))
            
            return {
                'filepath': str(filename),
                'title': info.get('title', 'Unknown'),
                'uploader': info.get('uploader', 'Unknown'),
                'duration': info.get('duration', 0),
                'is_audio_only': audio_only,
            }
            
    except Exception as e:
        print(f"ERROR downloading from YouTube: {e}", file=sys.stderr)
        return None


def get_video_info(url: str) -> Optional[dict]:
    """
    Get information about a YouTube video without downloading.
    
    Args:
        url: YouTube URL or video ID
        
    Returns:
        Dictionary with video info or None on error
    """
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            if info is None:
                return None
            
            return {
                'id': info.get('id', ''),
                'title': info.get('title', 'Unknown'),
                'uploader': info.get('uploader', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'description': info.get('description', ''),
            }
            
    except Exception as e:
        print(f"ERROR getting video info: {e}", file=sys.stderr)
        return None


if __name__ == "__main__":
    # CLI interface for testing and use from Rust
    import argparse
    
    parser = argparse.ArgumentParser(description='YouTube search and download utility')
    subparsers = parser.add_subparsers(dest='command', help='Command to execute')
    
    # Search command
    search_parser = subparsers.add_parser('search', help='Search YouTube')
    search_parser.add_argument('query', help='Search query')
    search_parser.add_argument('--max-results', type=int, default=20, help='Maximum results')
    
    # Download command
    download_parser = subparsers.add_parser('download', help='Download video')
    download_parser.add_argument('url', help='YouTube URL or video ID')
    download_parser.add_argument('--output-dir', required=True, help='Output directory')
    download_parser.add_argument('--audio-only', action='store_true', help='Download audio only')
    
    # Info command
    info_parser = subparsers.add_parser('info', help='Get video information')
    info_parser.add_argument('url', help='YouTube URL or video ID')
    
    args = parser.parse_args()
    
    if args.command == 'search':
        results = search_youtube(args.query, args.max_results)
        print(json.dumps(results, indent=2))
        
    elif args.command == 'download':
        result = download_video(args.url, args.output_dir, args.audio_only)
        if result:
            print(json.dumps(result, indent=2))
        else:
            sys.exit(1)
            
    elif args.command == 'info':
        info = get_video_info(args.url)
        if info:
            print(json.dumps(info, indent=2))
        else:
            sys.exit(1)
            
    else:
        parser.print_help()
        sys.exit(1)
