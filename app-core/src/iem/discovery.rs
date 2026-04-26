use mdns_sd::{ServiceDaemon, ServiceInfo};
use tracing::{info, warn};

pub struct MdnsAdvertiser {
    daemon: ServiceDaemon,
    fullname: String,
}

const SERVICE_TYPE: &str = "_nightingale-iem._tcp.local.";
const INSTANCE_NAME: &str = "Nightingale IEM";

impl MdnsAdvertiser {
    pub fn new(server_ip: &str, ws_port: u16) -> Result<Self, String> {
        let daemon = ServiceDaemon::new()
            .map_err(|e| format!("failed to create mDNS daemon: {e}"))?;

        let host_label = "nightingale-iem.local.";

        let properties = [("v", "1")];
        let service = ServiceInfo::new(
            SERVICE_TYPE,
            INSTANCE_NAME,
            host_label,
            server_ip,
            ws_port,
            &properties[..],
        )
        .map_err(|e| format!("failed to create mDNS service info: {e}"))?;

        let fullname = service.get_fullname().to_string();
        daemon
            .register(service)
            .map_err(|e| format!("failed to register mDNS service: {e}"))?;

        info!("mDNS: advertising {fullname} at {server_ip}:{ws_port}");
        Ok(Self { daemon, fullname })
    }

    pub fn shutdown(self) {
        if let Err(e) = self.daemon.unregister(&self.fullname) {
            warn!("mDNS unregister failed: {e}");
        }
        if let Err(e) = self.daemon.shutdown() {
            warn!("mDNS shutdown failed: {e}");
        }
        info!("mDNS: advertisement removed");
    }
}
