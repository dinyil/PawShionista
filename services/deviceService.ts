
import { supabase } from './supabaseClient';
import { Device } from '../types';

const STORAGE_KEY_DEVICE_ID = 'paw_device_id';

class DeviceService {
  private deviceId: string | null = null;

  constructor() {
    this.deviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!this.deviceId) {
      this.deviceId = this.generateUUID();
      localStorage.setItem(STORAGE_KEY_DEVICE_ID, this.deviceId);
    }
  }

  // Robust UUID generator that works in all contexts (including non-https localhost)
  private generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try {
        return crypto.randomUUID();
      } catch (e) {
        // Fallback if crypto.randomUUID throws (e.g. insecure context)
      }
    }
    // Timestamp + Random fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  getDeviceId() {
    return this.deviceId;
  }

  // Detect basic OS and Device Type from User Agent
  private getDeviceDetails() {
    const ua = navigator.userAgent;
    let type = 'Desktop';
    let os = 'Unknown OS';
    let browser = 'Unknown Browser';

    // Type Detection
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      type = 'Tablet';
    } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      type = 'Mobile';
    }

    // OS Detection
    if (ua.indexOf('Win') !== -1) os = 'Windows';
    else if (ua.indexOf('Mac') !== -1) os = 'MacOS';
    else if (ua.indexOf('Linux') !== -1) os = 'Linux';
    else if (ua.indexOf('Android') !== -1) os = 'Android';
    else if (ua.indexOf('like Mac') !== -1) os = 'iOS';

    // Browser Detection (Simple)
    if (ua.indexOf('Chrome') !== -1) browser = 'Chrome';
    else if (ua.indexOf('Safari') !== -1) browser = 'Safari';
    else if (ua.indexOf('Firefox') !== -1) browser = 'Firefox';
    else if (ua.indexOf('Edg') !== -1) browser = 'Edge';

    return { type, os, browser };
  }

  // Fetch Public IP and Location with timeout and better service
  private async getIpInfo(): Promise<{ ip: string; location: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

      // Switched to ipwho.is for better CORS support and free tier stability
      const response = await fetch('https://ipwho.is/', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Failed to fetch IP');
      const data = await response.json();
      
      // ipwho.is returns success: false on failure
      if (!data.success) return { ip: 'Unknown', location: 'Unknown' };

      return {
        ip: data.ip || 'Unknown',
        location: `${data.city || 'Unknown'}, ${data.country || 'Unknown'}`
      };
    } catch (e) {
      // Silent fail for IP fetch is okay
      return { ip: 'Unknown', location: 'Unknown' };
    }
  }

  async registerOrCheckDevice(): Promise<Device | null> {
    if (!this.deviceId) return null;

    const performCheck = async () => {
        // 1. Check if exists
        const { data: existing, error: selectError } = await supabase
          .from('devices')
          .select('*')
          .eq('device_id', this.deviceId)
          .single();

        // Handle "Row not found" explicitly (PGRST116 is not a fatal error here)
        if (selectError && selectError.code !== 'PGRST116') {
          throw selectError;
        }

        if (existing) {
          // Update last active - fire and forget to speed up
          supabase.from('devices').update({ last_active: new Date().toISOString() }).eq('id', existing.id).then();
          return existing as Device;
        }

        // 2. Register New Device
        const details = this.getDeviceDetails();
        const ipInfo = await this.getIpInfo();

        const newDevice: Partial<Device> = {
          device_id: this.deviceId as string, // Explicit cast to fix TS error
          name: `${details.os} ${details.type}`,
          type: details.type,
          os: details.os,
          browser: details.browser,
          ip_address: ipInfo.ip,
          location: ipInfo.location,
          status: 'pending',
          last_active: new Date().toISOString()
        };

        const { data: created, error: createError } = await supabase
          .from('devices')
          .insert(newDevice)
          .select()
          .single();
        
        if (createError) throw createError;

        return created as Device;
    };

    // Retry Logic (3 attempts with backoff) to handle network flakes
    for (let i = 0; i < 3; i++) {
        try {
            return await performCheck();
        } catch (err: any) {
            console.warn(`Device check attempt ${i+1} failed:`, err.message);
            // If it's the last attempt, log error and return null
            if (i === 2) {
                console.error('Device Security Error (Final):', err.message || err);
                return null;
            }
            // Exponential backoff: 1s, 2s
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }

    return null;
  }

  async getAllDevices() {
    const { data } = await supabase.from('devices').select('*').order('last_active', { ascending: false });
    return data as Device[];
  }

  async updateDeviceStatus(id: string, status: 'approved' | 'blocked' | 'pending') {
    await supabase.from('devices').update({ status }).eq('id', id);
  }

  async renameDevice(id: string, name: string) {
    await supabase.from('devices').update({ name }).eq('id', id);
  }
  
  async deleteDevice(id: string) {
      await supabase.from('devices').delete().eq('id', id);
  }
}

export const deviceService = new DeviceService();
