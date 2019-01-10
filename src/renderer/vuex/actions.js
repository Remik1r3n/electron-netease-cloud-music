import * as types from './mutation-types';
import { LOOP_MODE } from './modules/playlist';
import Api from '@/util/api/index';
import { User } from '@/util/models';

export async function restoreSettings({ commit }) {
    const st = await Api.getCurrentSettings();
    commit(types.UPDATE_SETTINGS, st);
}

export function setUserInfo({ commit }, payload) {
    commit(types.SET_USER_INFO, payload);
}

export async function storeUserInfo({ state }) {
    localStorage.setItem('user', JSON.stringify(state.user.info));
    const cookie = await Api.getCookie();
    localStorage.setItem('cookie', JSON.stringify(cookie));
}

export async function restoreUserInfo({ commit, dispatch }) {
    const user = localStorage.getItem('user');
    const cookie = localStorage.getItem('cookie');
    if (user && cookie) {
        const userObj = JSON.parse(user);
        const cookieObj = JSON.parse(cookie);
        commit(types.SET_USER_INFO, userObj);
        commit(types.SET_LOGIN_PENDING, true);
        Api.updateCookie(cookieObj);
        const resp = await Api.refreshLogin();
        commit(types.SET_LOGIN_PENDING, false);
        if (resp.code === 200) {
            dispatch('setLoginValid');
            return true;
        } else {
            Api.updateCookie({});
            return false;
        }
    }
}

export async function updateUserPlaylists({ state, commit }) {
    const { playlist } = await Api.getUserPlaylist(state.user.info.id);
    commit(types.UPDATE_USER_INFO, playlist[0].creator);
    commit(types.SET_USER_PLAYLISTS, playlist);
    return playlist;
}

export function setLoginValid({ commit, dispatch }, payload) {
    if (payload === undefined || payload === true) {
        commit(types.SET_LOGIN_VALID, true);
        Api.getCookie().then(cookie => {
            localStorage.setItem('cookie', JSON.stringify(cookie));
        });
        dispatch('updateUserPlaylists').then(playlist => {
            if (playlist[0].name.endsWith('喜欢的音乐')) {
                Api.getListDetail(playlist[0].id).then(list => {
                    commit(types.UPDATE_USER_PLAYLIST, list.playlist);
                });
            }
        });
    } else {
        commit(types.SET_LOGIN_VALID, false);
    }
}

export async function login({ commit, dispatch }, payload) {
    commit(types.SET_LOGIN_PENDING, true);
    const resp = await Api.login(payload.acc, payload.pwd);
    if (resp.code === 200) {
        dispatch('setUserInfo', resp);
        dispatch('setLoginValid', true);
        dispatch('storeUserInfo');
    }
    commit(types.SET_LOGIN_PENDING, false);
    return resp;
}

export async function logout({ commit }) {
    const resp = await Api.logout();
    if (resp.code == 200) {
        commit(types.SET_LOGIN_VALID, false);
        commit(types.SET_UI_FAV_ALBUM, null);
        commit(types.SET_UI_FAV_VIDEO, null);
        commit(types.SET_UI_FAV_ARTIST, null);
        setUserInfo({ commit }, new User());
        ['user', 'cookie'].map(k => localStorage.removeItem(k));
    }
}

export async function updateUiAudioSrc({ commit, state }) {
    const quality = state.settings.bitRate;
    const track = state.playlist.list[state.playlist.index];
    if (track && track.id) {
        const resp = await Api.getMusicUrlCached(track.id, quality);
        commit(types.UPDATE_PLAYING_URL, resp.url);
    }
}

export async function updateUiLyric({ commit, state }) {
    const track = state.playlist.list[state.playlist.index];
    if (track && track.id) {
        const lyric = await Api.getMusicLyricCached(track.id);
        commit(types.SET_ACTIVE_LYRIC, lyric);
    }
}

export async function updateUiAudioSrcNoCache({ commit, state }) {
    const { index, list } = state.playlist;
    const quality = state.settings.bitRate;
    const resp = await Api.getMusicUrlNoCache(list[index].id, quality);
    commit(types.UPDATE_PLAYING_URL, resp.url);
}

export function playAudio({ commit }) {
    commit(types.RESUME_PLAYING_MUSIC);
}

export function pauseAudio({ commit }) {
    commit(types.PAUSE_PLAYING_MUSIC);
}

export async function playTrackIndex({ commit, dispatch }, index) {
    commit(types.SET_CURRENT_INDEX, index);
    commit(types.SET_ACTIVE_LYRIC, {});
    dispatch('updateUiLyric');
    await dispatch('updateUiAudioSrc');
    commit(types.RESUME_PLAYING_MUSIC);
}

export function playNextTrack({ dispatch, state }) {
    const { index, list, loopMode } = state.playlist;
    let nextIndex;
    switch (loopMode) {
        case LOOP_MODE.RANDOM:
            nextIndex = Math.floor(Math.random() * list.length);
            break;
        default:
            nextIndex = (index + 1) % list.length;
            break;
    }
    dispatch('playTrackIndex', nextIndex);
}

export function playPreviousTrack({ dispatch, state }) {
    const { index, list, loopMode } = state.playlist;
    let nextIndex;
    switch (loopMode) {
        case LOOP_MODE.RANDOM:
            nextIndex = Math.floor(Math.random() * list.length);
            break;
        default:
            nextIndex = (index + list.length - 1) % list.length;
            break;
    }
    dispatch('playTrackIndex', nextIndex);
}

export async function playPlaylist({ commit, dispatch, state }, payload) {
    if (payload) {
        commit(types.SET_PLAY_LIST, payload);
    }
    const { list, loopMode } = state.playlist;
    let firstIndex;
    switch (loopMode) {
        case LOOP_MODE.RANDOM:
            firstIndex = Math.floor(Math.random * list.length);
            break;
        default:
            firstIndex = 0;
            break;
    }
    dispatch('playTrackIndex', firstIndex);
}

export function storePlaylist({ commit, state }) {
    if (!state.settings.autoPlay) {
        commit(types.PAUSE_PLAYING_MUSIC);
    }
    localStorage.setItem('playlist', JSON.stringify(state.playlist));
}

export function restorePlaylist({ commit, dispatch }) {
    try {
        const stored = localStorage.getItem('playlist');
        if (stored) {
            const playlist = JSON.parse(stored);
            commit(types.RESTORE_PLAYLIST, playlist);
            dispatch('updateUiAudioSrc');
            dispatch('updateUiLyric');
        }
    } catch (e) {
        // eslint-disable-next-line no-console
        console.info('Playlist stored in localStorage not valid.');
    }
}

export async function updatePlaylistDetail({ commit }, payload) {
    const listId = typeof payload === 'number' ? payload : payload.id;
    const resp = await Api.getListDetail(listId);
    commit(types.UPDATE_USER_PLAYLIST, resp.playlist);
}

export function toggleCollectPopup({ commit, state }, payload = {}) {
    const tracks = typeof payload === 'number'
        ? { ids: [payload] }
        : Array.isArray(payload)
            ? { ids: payload }
            : Array.isArray(payload.ids)
                ? { ids: payload.ids }
                : { ids: [] };
    commit(types.SET_COLLECT_TRACKS, tracks);
    if (state.ui.collectPopupShow === true) {
        commit(types.HIDE_COLLECT_POPUP);
        return;
    }
    commit(types.SHOW_COLLECT_POPUP);
}

export function nextLoopMode({ commit, state }) {
    const { loopMode } = state.playlist;
    switch (loopMode) {
        case LOOP_MODE.LIST:
            commit(types.SET_LOOP_MODE_SINGLE);
            break;
        case LOOP_MODE.SINGLE:
            commit(types.SET_LOOP_MODE_RANDOM);
            break;
        case LOOP_MODE.RANDOM:
            commit(types.SET_LOOP_MODE_LIST);
            break;
    }
}

export function insertTrackIntoPlaylist({ commit, state }, payload) {
    const tracks = Array.isArray(payload.tracks)
        ? payload.tracks
        : [payload.tracks];
    const index = payload.index || state.playlist.index;
    commit(types.INSERT_TRACK_INTO_PLAYLIST, { tracks, index });
}

export async function subscribePlaylist({ commit }, payload) {
    const resp = await Api.subscribePlaylist(payload.id);
    if (resp.code === 200) {
        commit(types.SUBSCRIBE_PLAYLIST, payload);
        return resp;
    }
    throw resp;
}

export async function unsubscribePlaylist({ commit }, payload) {
    const resp = await Api.unsubscribePlaylist(payload.id);
    if (resp.code === 200) {
        commit(types.UNSUBSCRIBE_PLAYLIST, payload);
        return resp;
    }
    throw resp;
}

export async function updateUserAlbums({ commit }) {
    const resp = await Api.getSubscribedAlumbs(1000);
    commit(types.SET_USER_ALBUMS, resp.data);
}

export async function setUiFavAlbum({ commit }, id) {
    const resp = await Api.getAlbumDetailW(id);
    commit(types.SET_UI_FAV_ALBUM, resp);
}

export async function setUiTempPlaylist({ commit }, id) {
    const resp = await Api.getListDetail(id);
    commit(types.SET_UI_TEMP_PLAYLIST, resp.playlist);
}

export async function setUiRelatedPlaylists({ commit }, id) {
    const resp = await Api.getRelatedPlaylists(id);
    commit(types.SET_UI_TEMP_RELATED_PLAYLISTS, resp.data);
}

export async function setUiRecommendSongs({ commit }) {
    const resp = await Api.getRecommendSongs();
    commit(types.SET_UI_RECOMMEND_SONGS, resp.recommend);
}

export async function setUiRecommendStatistics({ commit }) {
    const resp = await Api.getRecommendStatistics();
    commit(types.SET_UI_RECOMMEND_STATISTICS, resp.data);
}

export async function setUiTempAlbum({ commit }, id) {
    const resp = await Api.getAlbumDetailW(id);
    commit(types.SET_UI_TEMP_ALBUM, resp);
}

export async function setUiRelatedAlbums({ commit }, id) {
    const resp = await Api.getRelatedAlbums(id);
    commit(types.SET_UI_TEMP_RELATED_ALBUMS, resp.data);
}

export async function subscribeAlbum({ commit }, payload) {
    const resp = await Api.subscribeAlbum(payload.id);
    if (resp.code === 200 && typeof resp.time === 'number') {
        commit(types.SUBSCRIBE_ALBUM, payload);
        return;
    }
    throw resp;
}

export async function unsubscribeAlbum({ commit }, payload) {
    const resp = await Api.unsubscribeAlbum(payload.id);
    if (resp.code === 200 && typeof resp.time === 'number') {
        commit(types.UNSUBSCRIBE_ALBUM, payload);
        return;
    }
    throw resp;
}
